import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDecorationDef, isValidShopId, type ShopSave } from "@boba/shared";

/**
 * Where shops (money + furniture) are saved. Two backends:
 * - Upstash Redis (REST API) when UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set.
 *   Use this on hosts with an ephemeral disk (Render free wipes it on every restart/sleep/deploy).
 * - Otherwise JSON files: <DATA_DIR>/shops/<shopId>.json (DATA_DIR defaults to server/data).
 */
interface Backend {
  name: string;
  read(shopId: string): Promise<string | undefined>;
  write(shopId: string, json: string): Promise<void>;
}

// ---------------------------------------------------------------- File backend (local dev / own machine)

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../data");
const SHOPS_DIR = path.join(DATA_DIR, "shops");

const fileBackend: Backend = {
  name: `files in ${SHOPS_DIR}`,
  async read(shopId) {
    try {
      return await readFile(path.join(SHOPS_DIR, `${shopId}.json`), "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw err;
    }
  },
  /** Write atomically (temp file + rename) so a crash mid-write can't corrupt the save. */
  async write(shopId, json) {
    const file = path.join(SHOPS_DIR, `${shopId}.json`);
    await mkdir(SHOPS_DIR, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, json, "utf8");
    await rename(tmp, file);
  },
};

// ---------------------------------------------------------------- Upstash Redis backend (cloud)

const REDIS_TIMEOUT_MS = 10_000;

function upstashBackend(url: string, token: string): Backend {
  const key = (shopId: string) => `boba:shop:${shopId}`;
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
    async read(shopId) {
      const result = await command(["GET", key(shopId)]);
      return typeof result === "string" ? result : undefined;
    },
    async write(shopId, json) {
      await command(["SET", key(shopId), json]);
    },
  };
}

const backend: Backend =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? upstashBackend(process.env.UPSTASH_REDIS_REST_URL.replace(/\/+$/, ""), process.env.UPSTASH_REDIS_REST_TOKEN)
    : fileBackend;

export const storageName = backend.name;

// ---------------------------------------------------------------- API

const checkId = (shopId: string) => {
  if (!isValidShopId(shopId)) throw new Error(`Invalid shop id: ${shopId}`);
};

/**
 * Load a saved shop, or undefined if it doesn't exist yet. Invalid entries are dropped.
 * Throws if the storage can't be read (callers must not overwrite the save in that case).
 */
export async function loadShop(shopId: string): Promise<ShopSave | undefined> {
  checkId(shopId);
  const raw = await backend.read(shopId);
  if (raw === undefined) return undefined;

  const data = JSON.parse(raw) as Partial<ShopSave>;
  return {
    version: 1,
    money: Number.isFinite(data.money) ? Math.max(0, Math.floor(data.money!)) : 0,
    decorations: (Array.isArray(data.decorations) ? data.decorations : []).filter(
      (d) => d && getDecorationDef(d.kind) && Number.isFinite(d.x) && Number.isFinite(d.y),
    ),
  };
}

export async function saveShop(shopId: string, save: ShopSave): Promise<void> {
  checkId(shopId);
  await backend.write(shopId, JSON.stringify(save, null, 2));
}
