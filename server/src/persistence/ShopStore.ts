import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDecorationDef, isValidShopId, type ShopSave } from "@boba/shared";

/**
 * Saves each shop (money + furniture) as a JSON file: <DATA_DIR>/shops/<shopId>.json.
 * DATA_DIR defaults to server/data. Note: free cloud hosts (e.g. Render free) wipe the disk on restart.
 */
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../data");
const SHOPS_DIR = path.join(DATA_DIR, "shops");

const fileFor = (shopId: string) => {
  if (!isValidShopId(shopId)) throw new Error(`Invalid shop id: ${shopId}`);
  return path.join(SHOPS_DIR, `${shopId}.json`);
};

/** Load a saved shop, or undefined if it doesn't exist yet. Invalid entries are dropped. */
export async function loadShop(shopId: string): Promise<ShopSave | undefined> {
  let raw: string;
  try {
    raw = await readFile(fileFor(shopId), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }

  const data = JSON.parse(raw) as Partial<ShopSave>;
  return {
    version: 1,
    money: Number.isFinite(data.money) ? Math.max(0, Math.floor(data.money!)) : 0,
    decorations: (Array.isArray(data.decorations) ? data.decorations : []).filter(
      (d) => d && getDecorationDef(d.kind) && Number.isFinite(d.x) && Number.isFinite(d.y),
    ),
  };
}

/** Write atomically (temp file + rename) so a crash mid-write can't corrupt the save. */
export async function saveShop(shopId: string, save: ShopSave): Promise<void> {
  const file = fileFor(shopId);
  await mkdir(SHOPS_DIR, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(save, null, 2), "utf8");
  await rename(tmp, file);
}
