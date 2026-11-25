import express, { type Application } from "express";
import { addCustomDecoration, isCustomDecoration, parseCustomDecoration, DECORATION_CATALOG } from "@boba/shared";
import { loadCustomDecors } from "./persistence/ShopStore.js";

/**
 * Portal-added custom furniture: the stored records are loaded into the shared catalog at startup
 * (loadCustomCatalog, before the server listens) and the cut-out PNGs are kept in memory, served by
 * the public routes below. The admin API that creates / lists / deletes pieces lives in admin.ts.
 */

/** Cut-out PNGs by kind, served at GET /custom-decor/<kind>.png. */
const images = new Map<string, Buffer>();

export function getCustomDecorImage(kind: string): Buffer | undefined {
  return images.get(kind);
}

export function setCustomDecorImage(kind: string, png: Buffer): void {
  images.set(kind, png);
}

export function deleteCustomDecorImage(kind: string): void {
  images.delete(kind);
}

/**
 * Load every stored custom piece into the catalog before the server starts listening: shop saves drop
 * pieces whose kind is missing from the catalog, so the custom catalog must be complete first.
 * Records with an invalid definition are skipped with a warning. Returns how many pieces were loaded.
 */
export async function loadCustomCatalog(): Promise<number> {
  let loaded = 0;
  for (const record of await loadCustomDecors()) {
    const def = parseCustomDecoration(record.def);
    if (!def) {
      const kind = typeof record.def === "object" && record.def ? String((record.def as { kind?: unknown }).kind) : "?";
      console.warn(`[customDecor] skipped record with an invalid definition (kind ${kind})`);
      continue;
    }
    addCustomDecoration(def);
    if (typeof record.imagePng === "string") images.set(def.kind, Buffer.from(record.imagePng, "base64"));
    else console.warn(`[customDecor] custom decor ${def.kind} has no image`);
    loaded++;
  }
  return loaded;
}

/**
 * Public routes (the client may be hosted elsewhere, so CORS *): the catalog list, fetched by the
 * client on page load before joining a room, and the artwork PNGs (no-cache: new pieces must show
 * up after a page reload, not after a cached copy expires).
 */
export function registerCustomDecorRoutes(app: Application): void {
  app.get("/custom-decor", (_req, res) => {
    res
      .set("Access-Control-Allow-Origin", "*")
      .set("Cache-Control", "no-cache")
      .json({ items: DECORATION_CATALOG.filter((d) => isCustomDecoration(d.kind)) });
  });

  app.get("/custom-decor/:file", (req, res) => {
    const file = req.params.file;
    const kind = file.endsWith(".png") ? file.slice(0, -".png".length) : "";
    const png = kind ? images.get(kind) : undefined;
    if (!png) return void res.status(404).end();
    res.set("Access-Control-Allow-Origin", "*").set("Cache-Control", "no-cache").set("Content-Type", "image/png").send(png);
  });
}
