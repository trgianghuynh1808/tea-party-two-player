// Decorations (furniture): catalog + placement rules shared by server (validation) and client (drag preview).

import { STATIONS } from "./menu";

export type DecorationLayer =
  /** Lies on the floor (rugs): other furniture can be placed on top of it. */
  | "floor"
  /** Regular furniture: cannot overlap other furniture. */
  | "object";

export interface DecorationDef {
  kind: string;
  label: string;
  price: number;
  /** Fallback colour/shape (catalog swatch when there is no image, or the drawn shape). */
  color: number;
  shape: "rect" | "circle";
  /** Floor footprint in world px: used for placement rules and overlap checks. */
  width: number;
  height: number;
  layer: DecorationLayer;
  /** Artwork under client/public/ (e.g. "assets/decor/stool.png"). */
  image?: string;
  /**
   * On-screen height of the artwork; it stands on the footprint (bottom-aligned) and may rise above it,
   * like furniture seen from the front. Floor items (rugs) ignore this and fill the footprint.
   */
  imageHeight?: number;
  /** How it can be turned in decorate mode (default "none"). */
  rotation?: DecorationRotation;
  /** For rotation "views": artwork per facing, used instead of `image`. */
  views?: Record<DecorationView, string>;
}

/**
 * How a piece turns (rotation index 0..3, one press of R = next index):
 * - none:   looks the same from every side (plants, lanterns) — always 0.
 * - flip:   0 = as drawn, 1 = mirrored left/right.
 * - rotate: top-down art (rugs) turned by quarter turns; the footprint swaps width/height on 1 and 3.
 * - views:  separate artwork per facing: 0 front, 1 left, 2 back, 3 right (see VIEW_ORDER).
 */
export type DecorationRotation = "none" | "flip" | "rotate" | "views";
export type DecorationView = "front" | "left" | "back" | "right";
export const VIEW_ORDER: readonly DecorationView[] = ["front", "left", "back", "right"];

export function rotationCount(def: DecorationDef): number {
  return def.rotation === "flip" ? 2 : def.rotation === "rotate" || def.rotation === "views" ? 4 : 1;
}

/** Clamp untrusted input (client messages, old saves) to a rotation this piece supports. */
export function normalizeRotation(def: DecorationDef, rotation: unknown): number {
  const r = Number(rotation);
  return Number.isInteger(r) && r >= 0 && r < rotationCount(def) ? r : 0;
}

/** Floor footprint for a rotation: rugs turned a quarter swap width and height. */
export function footprintOf(def: DecorationDef, rotation = 0): { width: number; height: number } {
  return def.rotation === "rotate" && rotation % 2 === 1
    ? { width: def.height, height: def.width }
    : { width: def.width, height: def.height };
}

const decor = (
  kind: string,
  label: string,
  price: number,
  image: string,
  width: number,
  height: number,
  imageHeight: number,
  color = 0x8d6e63,
  rotation: DecorationRotation = "none",
): DecorationDef => ({
  kind,
  label,
  price,
  color,
  shape: "rect",
  width,
  height,
  layer: "object",
  image: `assets/decor/${image}.png`,
  imageHeight,
  rotation,
});

/** Rugs fill their footprint, so give it the artwork's aspect ratio. */
const rug = (kind: string, label: string, price: number, image: string, color: number, width = 120, height = 80): DecorationDef => ({
  kind,
  label,
  price,
  color,
  shape: "rect",
  width,
  height,
  layer: "floor",
  image: `assets/decor/${image}.png`,
  rotation: "rotate",
});

// Kinds are saved in shop files: keep existing ones (plant, lamp, chair, table, rug) when changing the catalog.
export const DECORATION_CATALOG: DecorationDef[] = [
  // Plants
  decor("plant", "Chậu dương xỉ", 50, "fern_medium", 30, 28, 44, 0x2a9d8f),
  decor("fern_small", "Dương xỉ nhỏ", 30, "fern_small", 24, 22, 32, 0x2a9d8f),
  decor("fern_large", "Dương xỉ lớn", 80, "fern_large", 46, 36, 58, 0x2a9d8f),
  decor("succulent", "Sen đá", 45, "succulent_1", 28, 26, 40, 0x457b9d),
  decor("succulent_small", "Sen đá mini", 25, "succulent_small", 22, 20, 30, 0x457b9d),
  decor("succulent_large", "Sen đá lớn", 55, "succulent_5", 30, 28, 46, 0x457b9d),
  // Seating
  {
    ...decor("chair", "Ghế mây", 40, "woven_chair_front", 30, 26, 58, 0xa1887f, "views"),
    // Built by client/assets-src/tools/build_chair_views.py from the 4-view sheet.
    views: {
      front: "assets/decor/woven_chair_front.png",
      left: "assets/decor/woven_chair_left.png",
      back: "assets/decor/woven_chair_back.png",
      right: "assets/decor/woven_chair_right.png",
    },
  },
  decor("stool", "Đôn gỗ", 35, "stool", 28, 24, 40, 0xa1887f, "flip"),
  { kind: "table", label: "Bàn khách", price: 90, color: 0x8d6e63, shape: "rect", width: 60, height: 40, layer: "object" },
  // Lighting
  decor("lamp", "Lồng đèn đỏ", 75, "red_lantern_lit", 30, 26, 56, 0xf4a261),
  decor("red_lantern", "Lồng đèn (tắt)", 55, "red_lantern", 28, 24, 50, 0xe76f51),
  decor("lantern_brass", "Đèn bão", 60, "lantern_brass", 26, 22, 48, 0xb08968),
  decor("lantern_lit", "Đèn bão (sáng)", 85, "lantern_gold_lit", 26, 22, 48, 0xffd166),
  decor("lantern_bronze_lit", "Đèn bão đồng (sáng)", 85, "lantern_bronze_lit", 26, 22, 48, 0xb5838d),
  // Rugs (furniture can stand on them)
  // Kind "rug" kept for old saves (it used to be a woven rug).
  rug("rug", "Thảm bánh mì", 120, "rug_bread", 0xf1dcc4, 150, 56),
  rug("rug_lavender", "Thảm oải hương", 70, "rug_lavender", 0xc3a6e6, 176, 54),
  rug("rug_red", "Thảm đỏ", 70, "rug_red", 0xe8616e, 160, 60),
  rug("rug_yellow_check", "Thảm caro vàng", 90, "rug_yellow_check", 0xfbeaa8, 160, 60),
  rug("rug_lilac", "Thảm hoa văn tím", 100, "rug_lilac", 0xb8b6dc, 162, 60),
  rug("rug_jute", "Thảm cói tròn", 100, "rug_jute", 0xc8956a, 162, 58),
  rug("rug_lily_pad", "Thảm lá sen", 110, "rug_lily_pad", 0x4fbf83, 158, 62),
  rug("rug_monstera", "Thảm lá monstera", 120, "rug_monstera", 0x7ccb85, 142, 68),
  rug("rug_meadow", "Thảm đồng cỏ hoa", 130, "rug_meadow", 0xa6d07a, 158, 60),
  rug("rug_pineapple", "Thảm quả dứa", 140, "rug_pineapple", 0xf2c45a, 184, 52),
  rug("rug_bear_brown", "Thảm gấu nâu", 150, "rug_bear_brown", 0xb08463, 146, 66),
  rug("rug_bear_white", "Thảm gấu trắng", 150, "rug_bear_white", 0xf1e6d6, 158, 60),
  rug("rug_tiger", "Thảm hổ con", 160, "rug_tiger", 0xe8b04a, 146, 66),
];

export const getDecorationDef = (kind: string) => DECORATION_CATALOG.find((d) => d.kind === kind);

/** Selling furniture refunds this fraction of its price. */
export const DECORATION_REFUND_RATE = 0.5;
export const refundFor = (def: DecorationDef) => Math.floor(def.price * DECORATION_REFUND_RATE);

/** Furniture snaps to this grid (world pixels). */
export const DECOR_GRID = 10;

/** Keep furniture inside the shop floor (top strip is the HUD / machine labels). */
const PLACE_AREA = { minX: 0, minY: 40, maxX: 960, maxY: 600 };
/** Minimum gap between furniture and stations so machines stay easy to see and reach. */
const STATION_MARGIN = 6;

export const snapToGrid = (v: number) => Math.round(v / DECOR_GRID) * DECOR_GRID;

export interface PlacedDecoration {
  id: string;
  kind: string;
  x: number;
  y: number;
  rotation?: number;
}

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const rectOf = (x: number, y: number, w: number, h: number, margin = 0): Rect => ({
  left: x - w / 2 - margin,
  top: y - h / 2 - margin,
  right: x + w / 2 + margin,
  bottom: y + h / 2 + margin,
});

const overlaps = (a: Rect, b: Rect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

/**
 * Can a decoration of `kind`, turned to `rotation`, be placed with its center at (x, y)?
 * `others` = furniture already in the shop; `ignoreId` = the piece being moved.
 */
export function canPlaceDecoration(
  kind: string,
  x: number,
  y: number,
  others: Iterable<PlacedDecoration>,
  ignoreId?: string,
  rotation = 0,
): boolean {
  const def = getDecorationDef(kind);
  if (!def || !Number.isFinite(x) || !Number.isFinite(y)) return false;

  const size = footprintOf(def, rotation);
  const r = rectOf(x, y, size.width, size.height);
  if (r.left < PLACE_AREA.minX || r.top < PLACE_AREA.minY || r.right > PLACE_AREA.maxX || r.bottom > PLACE_AREA.maxY) {
    return false;
  }

  for (const s of STATIONS) {
    if (overlaps(r, rectOf(s.x, s.y, s.width, s.height, STATION_MARGIN))) return false;
  }

  for (const o of others) {
    if (o.id === ignoreId) continue;
    const od = getDecorationDef(o.kind);
    // Furniture may sit on a rug, but rugs don't stack and furniture doesn't stack.
    if (!od || od.layer !== def.layer) continue;
    const os = footprintOf(od, o.rotation ?? 0);
    if (overlaps(r, rectOf(o.x, o.y, os.width, os.height))) return false;
  }
  return true;
}

// ---------------------------------------------------------------- Persistence

/** What is saved for a shop between rooms / server restarts. */
export interface ShopSave {
  version: 1;
  money: number;
  decorations: { kind: string; x: number; y: number; rotation?: number }[];
}

/** Shop ids are generated by the host's browser; keep them filename-safe. */
export const isValidShopId = (id: unknown): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(id);
