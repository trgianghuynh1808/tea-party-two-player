import { DECORATION_CATALOG, type DecorationCategory, type DecorationDef } from "./decor";

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

/** "prop" = an outdoor object standing on one cell (tree, bench, lamp...). */
export type BuildShape = "floor" | "wall" | "fence" | "door" | "prop";

export interface BuildTileDef {
  kind: string;
  label: string;
  price: number;
  shape: BuildShape;
  /** Main colour (palette swatch, drawn tile). */
  color: number;
  /** Second colour (planks, mortar, top of the wall...). */
  accent: number;
  /** Props: artwork client/public/assets/decor/yard/<image>.png (client/assets-src/tools/draw_yard_props.py). */
  image?: string;
  /** Props: build panel group ("decor" = furniture shared with the decorate catalog). */
  group?: "tree" | "outdoor" | "decor";
  /** Furniture props: the decorate-catalog piece this tile shows (its artwork, front view). */
  decor?: string;
  /** Furniture props: decorate-catalog group (build panel section). */
  category?: DecorationCategory;
  /** Props that block movement: size (world px) of the blocked box at the foot of the prop (trunk, base...). */
  block?: { w: number; h: number };
}

/** Players can't walk through these. */
export const isSolidShape = (shape: BuildShape) => shape === "wall" || shape === "fence";

/** Build kind of a decorate-catalog piece placed in the yard (prefixed so it never clashes with yard kinds). */
export const decorPropKind = (decorKind: string) => `decor_${decorKind}`;

function decorProp(d: DecorationDef): BuildTileDef {
  return {
    kind: decorPropKind(d.kind),
    label: d.label,
    price: d.price,
    shape: "prop",
    color: d.color,
    accent: 0x3d2c29,
    group: "decor",
    decor: d.kind,
    category: d.category,
    // The floor footprint blocks players, capped to the cell.
    block: { w: Math.min(d.width, BUILD_TILE - 4), h: Math.min(d.height, 16) },
  };
}

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
  // Outdoor props (one per cell; the art is bigger than the cell and stands on its bottom edge).
  ...(
    [
      ["tree_round_s", "Cây tròn nhỏ", 20, "tree", { w: 12, h: 8 }],
      ["tree_round_m", "Cây tròn vừa", 35, "tree", { w: 14, h: 10 }],
      ["tree_round_l", "Cây tròn lớn", 60, "tree", { w: 18, h: 10 }],
      ["pine_s", "Thông nhỏ", 20, "tree", { w: 10, h: 8 }],
      ["pine_m", "Thông vừa", 35, "tree", { w: 12, h: 8 }],
      ["pine_l", "Thông lớn", 60, "tree", { w: 16, h: 10 }],
      ["palm", "Cây dừa", 60, "tree", { w: 14, h: 10 }],
      ["tree_round_snow", "Cây phủ tuyết", 70, "tree", { w: 18, h: 10 }],
      ["pine_snow", "Thông phủ tuyết", 70, "tree", { w: 16, h: 10 }],
      ["stump", "Gốc cây", 10, "tree", { w: 36, h: 16 }],
      ["flower_bush", "Bụi hoa", 15, "tree", undefined],
      ["bench", "Ghế băng", 30, "outdoor", { w: 80, h: 14 }],
      ["barrel", "Thùng gỗ", 15, "outdoor", { w: 30, h: 14 }],
      ["crate", "Thùng thưa", 12, "outdoor", { w: 40, h: 16 }],
      ["rock", "Tảng đá", 10, "outdoor", { w: 48, h: 16 }],
      ["pumpkin", "Bí ngô", 8, "outdoor", undefined],
      ["balloons", "Chùm bóng bay", 20, "outdoor", undefined],
      ["parasol", "Dù lá", 40, "outdoor", { w: 10, h: 8 }],
      ["signpost", "Biển chỉ đường", 15, "outdoor", { w: 10, h: 8 }],
      ["mailbox", "Hộp thư", 20, "outdoor", { w: 10, h: 8 }],
      ["lamp_post", "Đèn đường", 35, "outdoor", { w: 10, h: 8 }],
      ["torch", "Đuốc", 10, "outdoor", { w: 8, h: 6 }],
    ] as const
  ).map(
    ([kind, label, price, group, block]): BuildTileDef => ({
      kind,
      label,
      price,
      shape: "prop",
      color: group === "tree" ? 0x4a9156 : 0x9c7457,
      accent: 0x3d2c29,
      image: kind,
      group,
      block,
    }),
  ),
  // Standing furniture from the decorate catalog (plants, chairs, lanterns...): one piece per cell, same art and price.
  // Rugs and wall art aren't included: they don't fit the one-object-per-cell grid.
  ...DECORATION_CATALOG.filter((d) => d.layer === "object").map(decorProp),
];

export const getBuildTile = (kind: string | undefined) => (kind ? BUILD_TILES.find((t) => t.kind === kind) : undefined);

/** Selling (erasing / replacing) a tile refunds this share of its price. */
export const BUILD_REFUND_RATE = 0.5;
export const buildRefund = (def: BuildTileDef) => Math.floor(def.price * BUILD_REFUND_RATE);
/** At most this many cells per build action (one drag). */
export const MAX_BUILD_CELLS = 800;

/** Tool picked in build mode: a tile kind, or "erase". */
export const ERASE_TOOL = "erase";

/**
 * A cell has two layers: a floor, and a structure standing on it (wall, fence, door or an outdoor prop).
 * Floor tools only touch the floor layer, the others the structure layer (so a cell has one wall or one prop).
 */
export type TileLayer = "floor" | "structure";
export const layerOf = (def: BuildTileDef): TileLayer => (def.shape === "floor" ? "floor" : "structure");

/** Synced / saved key of a cell's layer: "f:12,7" (floor) or "s:12,7" (structure). */
export const tileKey = (cx: number, cy: number, layer: TileLayer) => `${layer === "floor" ? "f" : "s"}:${cx},${cy}`;
export function parseTileKey(key: string): { cx: number; cy: number; layer: TileLayer } | undefined {
  const m = /^([fs]):(\d+),(\d+)$/.exec(key);
  return m ? { layer: m[1] === "f" ? "floor" : "structure", cx: Number(m[2]), cy: Number(m[3]) } : undefined;
}

/** Read access to the synced tiles map (MapSchema on both sides). */
export interface TileGetter {
  get(key: string): string | undefined;
}

export const floorAt = (tiles: TileGetter, cx: number, cy: number) => getBuildTile(tiles.get(tileKey(cx, cy, "floor")));
export const structureAt = (tiles: TileGetter, cx: number, cy: number) => getBuildTile(tiles.get(tileKey(cx, cy, "structure")));

// ---------------------------------------------------------------- Thin walls
// Walls and fences are thin and connect to their neighbours: the footprint is a strip through the middle of the
// cell (a centre post + an arm towards each connected neighbour). The art is drawn by
// client/assets-src/tools/draw_build_tiles.py with the same numbers.

/** How tall walls / doors stand above their footprint (px). */
export const WALL_HEIGHT = 34;
export const WALL_THICKNESS = 16;
export const FENCE_THICKNESS = 6;
/** Neighbour bits of a connection mask (also the art's file names: wall_brick_<mask>.png). */
export const CONNECT = { N: 1, E: 2, S: 4, W: 8 } as const;

/** Walls, fences and doors join up with each other; props stand alone. */
const connectsAt = (tiles: TileGetter, cx: number, cy: number) => {
  const def = structureAt(tiles, cx, cy);
  return !!def && def.shape !== "prop";
};

/** Which neighbours a structure connects to (any wall, fence or door connects to any other). */
export function connectMask(tiles: TileGetter, cx: number, cy: number): number {
  let mask = 0;
  if (connectsAt(tiles, cx, cy - 1)) mask |= CONNECT.N;
  if (connectsAt(tiles, cx + 1, cy)) mask |= CONNECT.E;
  if (connectsAt(tiles, cx, cy + 1)) mask |= CONNECT.S;
  if (connectsAt(tiles, cx - 1, cy)) mask |= CONNECT.W;
  return mask;
}

/** Props are drawn PROP_SCALE× their pixel-art size, standing PROP_BASE px above the cell's bottom edge. */
export const PROP_SCALE = 2;
export const PROP_BASE = 6;
/** Where a prop stands in its cell (world px): the foot of the art. */
export function propAnchor(cx: number, cy: number) {
  const c = cellRect(cx, cy);
  return { x: (c.left + c.right) / 2, y: c.bottom - PROP_BASE };
}

/** Does this tile block players (walls, fences, props with a blocked base)? */
export const isBlocking = (def: BuildTileDef) => isSolidShape(def.shape) || !!def.block;

/** Floor box (world px) of the strip a structure of `thickness` occupies in a cell, given its connections. */
export function stripRects(cx: number, cy: number, mask: number, thickness: number): Rect[] {
  const c = cellRect(cx, cy);
  const a = (BUILD_TILE - thickness) / 2;
  const b = (BUILD_TILE + thickness) / 2;
  const rects: Rect[] = [{ left: c.left + a, top: c.top + a, right: c.left + b, bottom: c.top + b }];
  if (mask & CONNECT.N) rects.push({ left: c.left + a, top: c.top, right: c.left + b, bottom: c.top + a });
  if (mask & CONNECT.S) rects.push({ left: c.left + a, top: c.top + b, right: c.left + b, bottom: c.bottom });
  if (mask & CONNECT.E) rects.push({ left: c.left + b, top: c.top + a, right: c.right, bottom: c.top + b });
  if (mask & CONNECT.W) rects.push({ left: c.left, top: c.top + a, right: c.left + a, bottom: c.top + b });
  return rects;
}

/** What blocks movement in a cell: the wall / fence strip or a prop's base (doors are walked through). */
export function blockingRects(tiles: TileGetter, cx: number, cy: number): Rect[] {
  const def = structureAt(tiles, cx, cy);
  if (def?.block) {
    const { x, y } = propAnchor(cx, cy);
    return [{ left: x - def.block.w / 2, top: y - def.block.h, right: x + def.block.w / 2, bottom: y }];
  }
  if (!def || !isSolidShape(def.shape)) return [];
  const mask = connectMask(tiles, cx, cy);
  return stripRects(cx, cy, mask, def.shape === "fence" ? FENCE_THICKNESS : WALL_THICKNESS);
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
  if (shape === "door" || shape === "prop") return canBuildCell(x1, y1) ? [{ cx: x1, cy: y1 }] : [];
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

/**
 * What a tool would do on one cell: the key it writes, the new kind ("" = removed) and the old kind.
 * The eraser removes the structure if there is one, else the floor. undefined = nothing to do.
 */
export function planCellChange(tiles: TileGetter, tool: string, cx: number, cy: number): { key: string; kind: string; old?: string } | undefined {
  const def = getBuildTile(tool);
  if (def) {
    const key = tileKey(cx, cy, layerOf(def));
    const old = tiles.get(key);
    return old === def.kind ? undefined : { key, kind: def.kind, old };
  }
  if (tool !== ERASE_TOOL) return undefined;
  for (const layer of ["structure", "floor"] as const) {
    const key = tileKey(cx, cy, layer);
    const old = tiles.get(key);
    if (old) return { key, kind: "", old };
  }
  return undefined;
}
