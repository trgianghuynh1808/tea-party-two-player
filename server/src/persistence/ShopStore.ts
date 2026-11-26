import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canBuildCell, getBuildTile, getDecorationDef, isValidShopId, layerOf, parseTileKey, tileKey, type DecorationDef, type ShopSave } from "@boba/shared";

/**
 * The game's database: three collections.
 * - users: one record per username (display name, timestamps, and the id of the user's shop).
 * - shops: money + furniture, linked from the user record by shopId.
 * - decor: portal-added custom furniture (definition + cut-out PNG), one record per kind.
 *
 * Two backends:
 * - Upstash Redis (REST API) when UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set
 *   (keys boba:user:<id>, boba:shop:<shopId> and boba:decor:<kind>). Use this on hosts with an
 *   ephemeral disk (Render free wipes it on every restart/sleep/deploy).
 * - Otherwise JSON files: <DATA_DIR>/users/<id>.json, <DATA_DIR>/shops/<shopId>.json and
 *   <DATA_DIR>/decor/<kind>.json (DATA_DIR defaults to server/data).
 */
type Collection = "users" | "shops" | "decor";

interface Backend {
  name: string;
  read(collection: Collection, id: string): Promise<string | undefined>;
  write(collection: Collection, id: string, json: string): Promise<void>;
  /** All record ids currently stored in a collection. */
  list(collection: Collection): Promise<string[]>;
  /** Remove one record; a record that isn't there is not an error. */
  delete(collection: Collection, id: string): Promise<void>;
}

// ---------------------------------------------------------------- File backend (local dev / own machine)

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../data");

const fileBackend: Backend = {
  name: `files in ${DATA_DIR}`,
  async read(collection, id) {
    try {
      return await readFile(path.join(DATA_DIR, collection, `${id}.json`), "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw err;
    }
  },
  /** Write atomically (temp file + rename) so a crash mid-write can't corrupt the save. */
  async write(collection, id, json) {
    const dir = path.join(DATA_DIR, collection);
    const file = path.join(dir, `${id}.json`);
    await mkdir(dir, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, json, "utf8");
    await rename(tmp, file);
  },
  async list(collection) {
    try {
      const files = await readdir(path.join(DATA_DIR, collection));
      return files.filter((file) => file.endsWith(".json")).map((file) => file.slice(0, -".json".length));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
  },
  async delete(collection, id) {
    try {
      await unlink(path.join(DATA_DIR, collection, `${id}.json`));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      throw err;
    }
  },
};

// ---------------------------------------------------------------- Upstash Redis backend (cloud)

const REDIS_TIMEOUT_MS = 10_000;
const REDIS_PREFIX: Record<Collection, string> = { users: "boba:user:", shops: "boba:shop:", decor: "boba:decor:" };

function upstashBackend(url: string, token: string): Backend {
  /** Run one Redis command through the Upstash REST API: POST ["CMD", ...args]. */
  async function command(args: string[]): Promise<unknown> {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(REDIS_TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => ({}))) as { result?: unknown; error?: string };
    if (!res.ok || body.error) throw new Error(`Upstash ${args[0]} failed: ${res.status} ${body.error ?? ""}`.trim());
    return body.result;
  }
  return {
    name: "Upstash Redis",
    async read(collection, id) {
      const result = await command(["GET", REDIS_PREFIX[collection] + id]);
      return typeof result === "string" ? result : undefined;
    },
    async write(collection, id, json) {
      await command(["SET", REDIS_PREFIX[collection] + id, json]);
    },
    async list(collection) {
      const prefix = REDIS_PREFIX[collection];
      const ids: string[] = [];
      let cursor = "0";
      do {
        const result = await command(["SCAN", cursor, "MATCH", `${prefix}*`, "COUNT", "200"]);
        const [next, keys] = Array.isArray(result) ? (result as [unknown, unknown]) : ["0", []];
        cursor = String(next);
        for (const key of Array.isArray(keys) ? keys : []) ids.push(String(key).slice(prefix.length));
      } while (cursor !== "0");
      // SCAN can come back empty on some setups even when matching keys exist; the database is
      // small, so one KEYS call is an acceptable fallback before concluding the collection is empty.
      if (!ids.length) {
        const keys = await command(["KEYS", `${prefix}*`]);
        if (Array.isArray(keys)) return keys.map((key) => String(key).slice(prefix.length));
      }
      return ids;
    },
    async delete(collection, id) {
      await command(["DEL", REDIS_PREFIX[collection] + id]);
    },
  };
}

const backend: Backend =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? upstashBackend(process.env.UPSTASH_REDIS_REST_URL.replace(/\/+$/, ""), process.env.UPSTASH_REDIS_REST_TOKEN)
    : fileBackend;

export const storageName = backend.name;

// ---------------------------------------------------------------- Users

export interface UserRecord {
  version: 1;
  /** Display name as last typed (e.g. "Ngọc"). */
  name: string;
  /** usernameKey(name): names are unique ignoring case. */
  key: string;
  /** Link to the user's shop (money + furniture) in the shops collection. */
  shopId: string;
  createdAt: string;
  lastSeenAt: string;
}

/** Record id of a username key: a hash, since names may contain any letter (ids must be filename-safe). */
export const userIdOf = (usernameKey: string) => `u_${createHash("sha256").update(usernameKey).digest("hex").slice(0, 32)}`;

/** The user record, or undefined if this name never played. Throws if the storage can't be read. */
export async function loadUser(usernameKey: string): Promise<UserRecord | undefined> {
  const raw = await backend.read("users", userIdOf(usernameKey));
  if (raw === undefined) return undefined;
  const data = JSON.parse(raw) as Partial<UserRecord>;
  if (data.key !== usernameKey || !isValidShopId(data.shopId)) throw new Error(`Corrupt user record for ${usernameKey}`);
  return data as UserRecord;
}

export async function saveUser(user: UserRecord): Promise<void> {
  await backend.write("users", userIdOf(user.key), JSON.stringify(user, null, 2));
}

/**
 * Delete a user's whole footprint: their shop save first, then the user record. Shop first, so a
 * delete interrupted in between leaves a user record without a shop, and the game then recreates
 * an empty shop ($0) on the next join. Callers must first stop the shop from writing (forgetShop).
 */
export async function deleteUserRecords(user: UserRecord): Promise<void> {
  checkId(user.shopId);
  await backend.delete("shops", user.shopId);
  await backend.delete("users", userIdOf(user.key));
}

/** Cap a skipped-record reason so it stays readable on one log line. */
const MAX_REASON_LENGTH = 200;

/**
 * The users listing plus storage diagnostics for the admin portal: the backend in use, how many
 * user/shop keys it sees, the user records that could be read, and every skipped record with a
 * short reason. Corrupt records are skipped (same rule as listUsers) so one bad record can't take
 * the whole listing down; only storage errors reject. Read-only.
 */
export async function inspectUsers(): Promise<{
  backend: string;
  userKeys: number;
  shopKeys: number;
  users: UserRecord[];
  skipped: { id: string; reason: string }[];
}> {
  const userIds = await backend.list("users");
  const shopIds = await backend.list("shops");
  const users: UserRecord[] = [];
  const skipped: { id: string; reason: string }[] = [];
  for (const id of userIds) {
    let raw: string | undefined;
    try {
      raw = await backend.read("users", id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      skipped.push({ id, reason: `đọc lỗi: ${message}`.slice(0, MAX_REASON_LENGTH) });
      continue;
    }
    if (raw === undefined) {
      skipped.push({ id, reason: "bản ghi không tồn tại" });
      continue;
    }
    let data: Partial<UserRecord>;
    try {
      data = JSON.parse(raw) as Partial<UserRecord>;
    } catch {
      skipped.push({ id, reason: "json hỏng" });
      continue;
    }
    if (typeof data.name !== "string" || typeof data.key !== "string") {
      skipped.push({ id, reason: "thiếu name/key" });
      continue;
    }
    if (userIdOf(data.key) !== id) {
      skipped.push({ id, reason: "id không khớp hash của key" });
      continue;
    }
    if (!isValidShopId(data.shopId)) {
      skipped.push({ id, reason: "shopId không hợp lệ" });
      continue;
    }
    users.push(data as UserRecord);
  }
  const head = skipped.slice(0, 5).map((entry) => `${entry.id}: ${entry.reason}`);
  console.log(
    `[ShopStore] users: ${userIds.length} keys, ${users.length} read, ${skipped.length} skipped` +
      (head.length ? ` (${head.join("; ")})` : ""),
  );
  return { backend: backend.name, userKeys: userIds.length, shopKeys: shopIds.length, users, skipped };
}

/**
 * Every user record in storage. Corrupt records are skipped (see inspectUsers) so one bad file
 * can't take the whole admin listing down; only storage errors reject.
 */
export async function listUsers(): Promise<UserRecord[]> {
  return (await inspectUsers()).users;
}

/**
 * Find or create the user of a name. With seen = true (the player joins), the display name and lastSeenAt
 * are updated; with seen = false (admin tools), an existing record is left as is.
 * New users get the shop id derived from their name, which is also where shops were saved before user
 * records existed, so those saves stay linked.
 */
export async function upsertUser(name: string, usernameKey: string, seen = true): Promise<UserRecord> {
  const now = new Date().toISOString();
  const existing = await loadUser(usernameKey);
  if (existing && !seen) return existing;
  const user: UserRecord = existing
    ? { ...existing, name, lastSeenAt: now }
    : { version: 1, name, key: usernameKey, shopId: userIdOf(usernameKey), createdAt: now, lastSeenAt: now };
  await saveUser(user);
  if (!existing) console.log(`[ShopStore] new user ${name} -> shop ${user.shopId}`);
  return user;
}

// ---------------------------------------------------------------- Shops

const checkId = (shopId: string) => {
  if (!isValidShopId(shopId)) throw new Error(`Invalid shop id: ${shopId}`);
};

/** Validate a save (from storage or an uploaded backup). Invalid entries are dropped. */
export function parseShopSave(data: unknown): ShopSave {
  const save = (data && typeof data === "object" ? data : {}) as Partial<ShopSave>;
  return {
    version: 1,
    money: Number.isFinite(save.money) ? Math.max(0, Math.floor(save.money!)) : 0,
    // Old saves have no rod: the starting rod (level 1). Clamped to the levels that exist.
    rodLevel: Number.isFinite(save.rodLevel) ? Math.min(5, Math.max(1, Math.floor(save.rodLevel!))) : 1,
    decorations: (Array.isArray(save.decorations) ? save.decorations : [])
      .filter((d) => d && getDecorationDef(d.kind) && Number.isFinite(d.x) && Number.isFinite(d.y))
      .map(({ kind, x, y, rotation }) => ({ kind, x, y, rotation: Number.isFinite(rotation) ? rotation : 0 })),
    tiles: parseTiles(save.tiles),
    tileRotations: parseTileRotations(save.tileRotations),
  };
}

/** Prop facings from a save: only structure keys with an integer index are kept (missing in old saves). */
function parseTileRotations(data: unknown): Record<string, number> {
  const rotations: Record<string, number> = {};
  if (!data || typeof data !== "object") return rotations;
  for (const [key, rot] of Object.entries(data)) {
    const cell = parseTileKey(key);
    if (cell?.layer !== "structure" || !Number.isInteger(rot) || (rot as number) < 0) continue;
    rotations[key] = rot as number;
  }
  return rotations;
}

/** Saves from the first yard version keyed cells as "12,7" (one tile per cell, no layers). */
const LEGACY_TILE_KEY = /^(\d+),(\d+)$/;

function parseTiles(data: unknown): Record<string, string> {
  const tiles: Record<string, string> = {};
  if (!data || typeof data !== "object") return tiles;
  let dropped = 0;
  for (const [key, kind] of Object.entries(data)) {
    const def = typeof kind === "string" ? getBuildTile(kind) : undefined;
    const legacy = LEGACY_TILE_KEY.exec(key);
    // Old single-layer key: move the tile to the layer its kind belongs to (floor or structure).
    const cell = legacy && def ? { cx: Number(legacy[1]), cy: Number(legacy[2]), layer: layerOf(def) } : parseTileKey(key);
    // The kind must belong on that layer (a wall saved under a floor key is dropped).
    if (cell && def && layerOf(def) === cell.layer && canBuildCell(cell.cx, cell.cy)) {
      tiles[tileKey(cell.cx, cell.cy, cell.layer)] ??= def.kind;
    } else {
      dropped++;
    }
  }
  // Never silent: a format change that doesn't read old saves would wipe them on the next save.
  if (dropped) console.warn(`[ShopStore] dropped ${dropped} unreadable yard tile(s) from a save`);
  return tiles;
}

/**
 * Load a saved shop, or undefined if it doesn't exist yet.
 * Throws if the storage can't be read (callers must not overwrite the save in that case).
 */
export async function loadShop(shopId: string): Promise<ShopSave | undefined> {
  checkId(shopId);
  const raw = await backend.read("shops", shopId);
  return raw === undefined ? undefined : parseShopSave(JSON.parse(raw));
}

export async function saveShop(shopId: string, save: ShopSave): Promise<void> {
  checkId(shopId);
  await backend.write("shops", shopId, JSON.stringify(save, null, 2));
}

// ---------------------------------------------------------------- Custom furniture (admin portal)

/** A portal-added furniture piece as stored: its catalog definition plus the cut-out PNG (base64). */
export interface CustomDecorRecord {
  version: 1;
  def: DecorationDef;
  /** Served at GET /custom-decor/<kind>.png. */
  imagePng: string;
}

export async function saveCustomDecor(kind: string, record: CustomDecorRecord): Promise<void> {
  await backend.write("decor", kind, JSON.stringify(record, null, 2));
}

/** Every stored custom piece. Corrupt records are skipped with a warning so one bad record can't stop the server. */
export async function loadCustomDecors(): Promise<CustomDecorRecord[]> {
  const records: CustomDecorRecord[] = [];
  for (const id of await backend.list("decor")) {
    const raw = await backend.read("decor", id);
    if (raw === undefined) continue;
    try {
      records.push(JSON.parse(raw) as CustomDecorRecord);
    } catch {
      console.warn(`[ShopStore] skipped corrupt custom decor record ${id}`);
    }
  }
  return records;
}

export async function deleteCustomDecor(kind: string): Promise<void> {
  await backend.delete("decor", kind);
}
