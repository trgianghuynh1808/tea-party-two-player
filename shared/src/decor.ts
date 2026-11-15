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
): DecorationDef => ({ kind, label, price, color, shape: "rect", width, height, layer: "object", image: `assets/decor/${image}.png`, imageHeight });

const rug = (kind: string, label: string, price: number, image: string, color: number): DecorationDef => ({
  kind,
  label,
  price,
  color,
  shape: "rect",
  width: 120,
  height: 80,
  layer: "floor",
  image: `assets/decor/${image}.png`,
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
  decor("chair", "Ghế mây", 40, "woven_chair", 30, 26, 58, 0xa1887f),
  decor("stool", "Đôn gỗ", 35, "stool", 28, 24, 40, 0xa1887f),
  { kind: "table", label: "Bàn khách", price: 90, color: 0x8d6e63, shape: "rect", width: 60, height: 40, layer: "object" },
  // Lighting
  decor("lamp", "Lồng đèn đỏ", 75, "red_lantern_lit", 30, 26, 56, 0xf4a261),
  decor("red_lantern", "Lồng đèn (tắt)", 55, "red_lantern", 28, 24, 50, 0xe76f51),
  decor("lantern_brass", "Đèn bão", 60, "lantern_brass", 26, 22, 48, 0xb08968),
  decor("lantern_lit", "Đèn bão (sáng)", 85, "lantern_gold_lit", 26, 22, 48, 0xffd166),
  decor("lantern_bronze_lit", "Đèn bão đồng (sáng)", 85, "lantern_bronze_lit", 26, 22, 48, 0xb5838d),
  // Rugs (furniture can stand on them)
  rug("rug", "Thảm cói", 120, "rug_woven", 0xd4a373),
  rug("rug_blue", "Thảm xanh hoa văn", 150, "rug_blue", 0x457b9d),
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
 * Can a decoration of `kind` be placed with its center at (x, y)?
 * `others` = furniture already in the shop; `ignoreId` = the piece being moved.
 */
export function canPlaceDecoration(
  kind: string,
  x: number,
  y: number,
  others: Iterable<PlacedDecoration>,
  ignoreId?: string,
): boolean {
  const def = getDecorationDef(kind);
  if (!def || !Number.isFinite(x) || !Number.isFinite(y)) return false;

  const r = rectOf(x, y, def.width, def.height);
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
    if (overlaps(r, rectOf(o.x, o.y, od.width, od.height))) return false;
  }
  return true;
}

// ---------------------------------------------------------------- Persistence

/** What is saved for a shop between rooms / server restarts. */
export interface ShopSave {
  version: 1;
  money: number;
  decorations: { kind: string; x: number; y: number }[];
}

/** Shop ids are generated by the host's browser; keep them filename-safe. */
export const isValidShopId = (id: unknown): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(id);
