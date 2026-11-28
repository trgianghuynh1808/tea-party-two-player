// Custom furniture added through the admin portal: validation rules + catalog mutation,
// shared by the server (loading saves, admin API) and the client (fetching the catalog on page load).
// Custom pieces have one front-facing artwork (rotation is always "none"; old "flip"/"rotate"
// records load as "none") and their PNG is served by the game server at GET /custom-decor/<kind>.png.

import {
  DECORATION_CATEGORIES,
  DECORATION_CATALOG,
  type DecorationDef,
  type DecorationLayer,
  type DecorationRotation,
} from "./decor";
import { BUILD_TILES, decorProp, decorPropKind } from "./world";

/** Every custom kind starts with this prefix. */
export const CUSTOM_DECOR_PREFIX = "custom_";
/** URL folder the cut-out PNGs are served from (GET /custom-decor/<kind>.png). */
export const CUSTOM_DECOR_URL = "custom-decor";
/** At most this many custom pieces may be stored. */
export const CUSTOM_DECOR_MAX_ITEMS = 200;
/** One cut-out PNG may be at most this many bytes (checked on the admin upload). */
export const CUSTOM_DECOR_MAX_IMAGE_BYTES = 300_000;

const CATEGORY_IDS = new Set<string>(DECORATION_CATEGORIES.map((c) => c.id));
const LAYERS: readonly DecorationLayer[] = ["floor", "object", "wall"];

const isIntegerBetween = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;

/**
 * Validate an untrusted custom-decoration definition (admin upload, stored records, client fetch).
 * Returns the normalized def, or undefined when anything is out of range. The image URL is always
 * rebuilt from the kind, so a record can't point the client somewhere else.
 */
export function parseCustomDecoration(raw: unknown): DecorationDef | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.kind !== "string" || !/^custom_[a-z0-9_]{1,40}$/.test(r.kind)) return undefined;
  if (typeof r.label !== "string" || r.label.trim().length < 1 || r.label.trim().length > 40) return undefined;
  if (!isIntegerBetween(r.price, 0, 100_000)) return undefined;
  if (r.category !== undefined && (typeof r.category !== "string" || !CATEGORY_IDS.has(r.category))) return undefined;
  if (typeof r.layer !== "string" || !LAYERS.includes(r.layer as DecorationLayer)) return undefined;
  const layer = r.layer as DecorationLayer;
  if (!isIntegerBetween(r.width, 4, 400) || !isIntegerBetween(r.height, 4, 400)) return undefined;
  if (!isIntegerBetween(r.imageHeight, 4, 400)) return undefined;
  // Rotation: always "none" — custom pieces have one front-facing artwork, so anything the
  // client/portal sends (old "flip"/"rotate" included) loads as a fixed facing, not a rejection.
  const rotation: DecorationRotation = "none";
  // Roles only make sense for standing furniture (customers can't sit on a rug or a painting).
  if (r.role !== undefined && r.role !== "seat" && r.role !== "table" && r.role !== "bed") return undefined;
  if (r.role !== undefined && layer !== "object") return undefined;
  let pillow: { x: number; y: number } | undefined;
  if (r.role === "bed") {
    const p = (r.pillow ?? {}) as { x?: unknown; y?: unknown };
    const x = p.x === undefined ? 0.5 : p.x;
    const y = p.y === undefined ? 0.3 : p.y;
    if (typeof x !== "number" || !Number.isFinite(x) || x < 0 || x > 1) return undefined;
    if (typeof y !== "number" || !Number.isFinite(y) || y < 0 || y > 1) return undefined;
    pillow = { x, y };
  }
  const color = r.color === undefined ? 0x8d6e63 : r.color;
  if (!isIntegerBetween(color, 0, 0xffffff)) return undefined;

  const def: DecorationDef = {
    kind: r.kind,
    label: r.label.trim(),
    price: r.price,
    color,
    shape: "rect",
    width: r.width,
    height: r.height,
    layer,
    image: `${CUSTOM_DECOR_URL}/${r.kind}.png`,
    imageHeight: r.imageHeight,
    rotation,
  };
  if (r.category !== undefined) def.category = r.category as DecorationDef["category"];
  if (r.role !== undefined) def.role = r.role;
  if (pillow) def.pillow = pillow;
  return def;
}

/**
 * Add (or replace, keeping the kind) a custom piece: edit the decorate catalog in place and keep
 * BUILD_TILES in sync (standing pieces get one yard cell `decor_<kind>`; rugs / wall art don't
 * map to a cell and never appear in build mode).
 */
export function addCustomDecoration(def: DecorationDef): void {
  const index = DECORATION_CATALOG.findIndex((d) => d.kind === def.kind);
  if (index >= 0) DECORATION_CATALOG[index] = def;
  else DECORATION_CATALOG.push(def);
  const tileKind = decorPropKind(def.kind);
  const tileIndex = BUILD_TILES.findIndex((t) => t.kind === tileKind);
  if (tileIndex >= 0) BUILD_TILES.splice(tileIndex, 1);
  if (def.layer === "object") BUILD_TILES.push(decorProp(def));
}

/** Drop a custom piece from the decorate catalog and the build tiles. */
export function removeCustomDecoration(kind: string): void {
  const index = DECORATION_CATALOG.findIndex((d) => d.kind === kind);
  if (index >= 0) DECORATION_CATALOG.splice(index, 1);
  const tileKind = decorPropKind(kind);
  const tileIndex = BUILD_TILES.findIndex((t) => t.kind === tileKind);
  if (tileIndex >= 0) BUILD_TILES.splice(tileIndex, 1);
}

/** Is this catalog kind a portal-added custom piece? */
export const isCustomDecoration = (kind: string) => kind.startsWith(CUSTOM_DECOR_PREFIX);
