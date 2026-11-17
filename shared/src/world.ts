// The world outside the tea shop: a big yard with the shop building in its top-left corner.
// Everything lives in one coordinate system so positions, collisions and the camera stay simple:
// - the shop interior is the 960×600 box at the origin (as before),
// - the yard is a separate box further down (YARD); nothing exists in the gap between them.
// Players move between the two through the shop's door (teleport, see UseDoor).

/** Size of one build cell in the yard (world px). */
export const BUILD_TILE = 40;

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const YARD = { x: 0, y: 1000, width: 2400, height: 1600 } as const;
export const YARD_COLS = YARD.width / BUILD_TILE;
export const YARD_ROWS = YARD.height / BUILD_TILE;
/** Anything below this line is in the yard; above it, inside the shop. */
const AREA_SPLIT_Y = (600 + YARD.y) / 2;
export const isInYard = (p: { y: number }) => p.y >= AREA_SPLIT_Y;

/** The shop seen from outside (blocks movement); its door is in the middle of the front wall. */
export const SHOP_BUILDING: Rect = { left: 40, top: YARD.y + 40, right: 440, bottom: YARD.y + 300 };
export const SHOP_DOOR_X = (SHOP_BUILDING.left + SHOP_BUILDING.right) / 2;
/** Stepping on the doormat in front of the shop goes inside. */
export const SHOP_ENTER_ZONE: Rect = { left: SHOP_DOOR_X - 26, top: SHOP_BUILDING.bottom, right: SHOP_DOOR_X + 26, bottom: SHOP_BUILDING.bottom + 28 };
/** Where a player coming out of the shop appears (a step away from the doormat). */
export const YARD_SPAWN = { x: SHOP_DOOR_X, y: SHOP_BUILDING.bottom + 70 };
/** Inside: the way out is at the bottom-centre of the shop floor. */
export const SHOP_EXIT_ZONE: Rect = { left: 440, top: 576, right: 520, bottom: 600 };
/** Where a player walking into the shop appears. */
export const SHOP_ENTRY_SPAWN = { x: 480, y: 530 };
/** The shop's own lot (building + front yard): nothing can be built there. */
export const SHOP_LOT: Rect = { left: 0, top: YARD.y, right: 520, bottom: YARD.y + 440 };

export const inRect = (p: { x: number; y: number }, r: Rect, margin = 0) =>
  p.x >= r.left - margin && p.x <= r.right + margin && p.y >= r.top - margin && p.y <= r.bottom + margin;

// ---------------------------------------------------------------- Building (yard tiles)

export type BuildShape = "floor" | "wall" | "fence" | "door";

export interface BuildTileDef {
  kind: string;
  label: string;
  price: number;
  shape: BuildShape;
  /** Main colour (palette swatch, drawn tile). */
  color: number;
  /** Second colour (planks, mortar, top of the wall...). */
  accent: number;
}

/** Players can't walk through these. */
export const isSolidShape = (shape: BuildShape) => shape === "wall" || shape === "fence";

// Kinds are saved in shop files: keep existing ones when changing the catalog.
export const BUILD_TILES: BuildTileDef[] = [
  { kind: "floor_wood", label: "Sàn gỗ", price: 2, shape: "floor", color: 0xc8956a, accent: 0xa87650 },
  { kind: "floor_stone", label: "Sàn đá", price: 3, shape: "floor", color: 0xc4c1b9, accent: 0x9a978f },
  { kind: "floor_tile", label: "Sàn gạch hoa", price: 3, shape: "floor", color: 0xf1e6d6, accent: 0xd4a373 },
  { kind: "floor_pink", label: "Sàn hồng", price: 3, shape: "floor", color: 0xf4c6c6, accent: 0xe8a5a5 },
  { kind: "path_dirt", label: "Đường đất", price: 1, shape: "floor", color: 0xc9a074, accent: 0xa98157 },
  { kind: "wall_wood", label: "Tường gỗ", price: 6, shape: "wall", color: 0x9c7457, accent: 0xc29a78 },
  { kind: "wall_brick", label: "Tường gạch", price: 8, shape: "wall", color: 0xb5543c, accent: 0xe8d5c4 },
  { kind: "wall_white", label: "Tường trắng", price: 8, shape: "wall", color: 0xf3ece2, accent: 0xd8cbb9 },
  { kind: "fence", label: "Hàng rào", price: 4, shape: "fence", color: 0xe3c49a, accent: 0x9c7457 },
  { kind: "door", label: "Cửa", price: 15, shape: "door", color: 0x8d5a3b, accent: 0xc29a78 },
];

export const getBuildTile = (kind: string | undefined) => (kind ? BUILD_TILES.find((t) => t.kind === kind) : undefined);

/** Selling (erasing / replacing) a tile refunds this share of its price. */
export const BUILD_REFUND_RATE = 0.5;
export const buildRefund = (def: BuildTileDef) => Math.floor(def.price * BUILD_REFUND_RATE);
/** At most this many cells per build action (one drag). */
export const MAX_BUILD_CELLS = 800;

/** Tool picked in build mode: a tile kind, or "erase". */
export const ERASE_TOOL = "erase";

export const tileKey = (cx: number, cy: number) => `${cx},${cy}`;
export function parseTileKey(key: string): { cx: number; cy: number } | undefined {
  const m = /^(\d+),(\d+)$/.exec(key);
  return m ? { cx: Number(m[1]), cy: Number(m[2]) } : undefined;
}

/** World box of a yard cell. */
export const cellRect = (cx: number, cy: number): Rect => ({
  left: YARD.x + cx * BUILD_TILE,
  top: YARD.y + cy * BUILD_TILE,
  right: YARD.x + (cx + 1) * BUILD_TILE,
  bottom: YARD.y + (cy + 1) * BUILD_TILE,
});

/** Yard cell under a world position (may be outside the yard). */
export const cellAt = (x: number, y: number) => ({
  cx: Math.floor((x - YARD.x) / BUILD_TILE),
  cy: Math.floor((y - YARD.y) / BUILD_TILE),
});

const overlaps = (a: Rect, b: Rect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

/** Inside the yard and off the shop's lot. */
export function canBuildCell(cx: number, cy: number): boolean {
  if (!Number.isInteger(cx) || !Number.isInteger(cy) || cx < 0 || cy < 0 || cx >= YARD_COLS || cy >= YARD_ROWS) return false;
  return !overlaps(cellRect(cx, cy), SHOP_LOT);
}

/**
 * Cells a drag from cell (x0, y0) to (x1, y1) affects with `tool`:
 * floors and the eraser fill the rectangle, walls and fences draw its outline (a line if it's 1 cell thick),
 * a door goes on the last cell only. Cells that can't be built on are left out.
 */
export function cellsForTool(tool: string, x0: number, y0: number, x1: number, y1: number): { cx: number; cy: number }[] {
  const shape = tool === ERASE_TOOL ? "floor" : getBuildTile(tool)?.shape;
  if (!shape || ![x0, y0, x1, y1].every(Number.isInteger)) return [];
  if (shape === "door") return canBuildCell(x1, y1) ? [{ cx: x1, cy: y1 }] : [];
  const [left, right] = [Math.min(x0, x1), Math.max(x0, x1)];
  const [top, bottom] = [Math.min(y0, y1), Math.max(y0, y1)];
  if ((right - left + 1) * (bottom - top + 1) > MAX_BUILD_CELLS * 4) return [];
  const outline = shape === "wall" || shape === "fence";
  const cells: { cx: number; cy: number }[] = [];
  for (let cy = top; cy <= bottom; cy++) {
    for (let cx = left; cx <= right; cx++) {
      if (outline && cx !== left && cx !== right && cy !== top && cy !== bottom) continue;
      if (canBuildCell(cx, cy)) cells.push({ cx, cy });
    }
  }
  return cells.length > MAX_BUILD_CELLS ? cells.slice(0, MAX_BUILD_CELLS) : cells;
}

/** Is the yard cell blocked (a wall or fence)? Built from the synced tiles map. */
export type SolidLookup = (cx: number, cy: number) => boolean;
export const solidLookup =
  (tiles: { get(key: string): string | undefined }): SolidLookup =>
  (cx, cy) => {
    const def = getBuildTile(tiles.get(tileKey(cx, cy)));
    return !!def && isSolidShape(def.shape);
  };
