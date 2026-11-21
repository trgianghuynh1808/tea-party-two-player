// Shared constants between server and client.

export const ROOM_NAME = "boba_shop";
export const SERVER_PORT = 2567;


/** Usernames, room list and join rules. */
export * from "./lobby";

export const WORLD_WIDTH = 960;
export const WORLD_HEIGHT = 600;
export const PLAYER_RADIUS = 18;
export const PLAYER_SPEED = 200; // pixels per second
export const INTERACT_RANGE = 70; // max distance from player center to station edge
/** Stations the player is facing count as this much closer when picking which station to interact with. */
export const FACING_BIAS = 30;

export type Direction = "up" | "down" | "left" | "right";

/** Character chosen in the lobby before entering a room. */
export * from "./characters";

export * from "./menu";
import { STATIONS, WALL_BOTTOM, type StationDef } from "./menu";
/** The restaurant's kitchen, menu and dining room; venue rules (tea shop / restaurant). */
export * from "./restaurant";
export * from "./venues";
import { RESTAURANT_STATIONS } from "./restaurant";
import type { Venue } from "./venues";

// Message payloads (client -> server)
/**
 * Client-authoritative movement: each client simulates its own player and reports its position.
 * The server validates it (speed budget + collisions) and relays it to the other player.
 */
export interface PositionMessage {
  x: number;
  y: number;
  direction: Direction;
  /** Player.teleportSeq the client had applied; stale reports from before a server teleport are dropped. */
  teleportSeq: number;
}

/** How often a moving client reports its position. */
export const POSITION_SEND_INTERVAL_MS = 50;

export const Messages = {
  Position: "position",
  Interact: "interact",
  BuyDecoration: "buy_decoration",
  MoveDecoration: "move_decoration",
  SellDecoration: "sell_decoration",
  /** Open a shift: StartShiftMessage (which venue). */
  StartShift: "start_shift",
  /** Go through the shop's door (inside <-> yard). The player must stand in the door zone. */
  UseDoor: "use_door",
  /** Build (or erase) yard tiles over a dragged rectangle of cells: BuildTilesMessage. */
  BuildTiles: "build_tiles",
  /** Get out of bed (sent when a player lying down tries to walk). */
  LeaveBed: "leave_bed",
} as const;

export interface StartShiftMessage {
  venue: Venue;
}

export interface BuildTilesMessage {
  /** Tile kind (see BUILD_TILES) or ERASE_TOOL. */
  tool: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// Server -> client events
export const ServerEvents = {
  Delivered: "delivered",
  InteractFailed: "interact_failed",
  OrderExpired: "order_expired",
  MachineOverflow: "machine_overflow",
} as const;

export interface DeliveredEvent {
  by: string;
  orderId: string;
  drinkName: string;
  /** Drinks delivered / total for this order (group orders have more than one). */
  served: number;
  total: number;
  /** Money earned: 0 until the whole order is delivered. */
  amount: number;
  /** Short explanations of bonuses / cuts, e.g. "tip nhanh +$5", "combo x3 +$7". */
  notes: string[];
}

export interface OrderExpiredEvent {
  label: string;
  penalty: number;
}

export interface MachineOverflowEvent {
  machine: string;
  /** Restaurant: the food burnt (it stays on the cooker as burnt food) instead of a cup spilling. */
  burnt?: boolean;
}

export * from "./decor";
/** Where furniture can go (tea shop / restaurant). */
export * from "./placement";
export * from "./world";
import {
  BUILD_TILE,
  OUTDOOR,
  PROP_ART_DROP,
  RESTAURANT,
  RESTAURANT_BUILDING,
  SHOP_BUILDING,
  YARD,
  areaOf,
  blockingRects,
  getBuildTile,
  parseTileKey,
  propAnchor,
  tileKey,
  type TileGetter,
} from "./world";
export * from "./seating";
import { distanceToBox, footprintBox } from "./seating";
import { getDecorationDef, type PlacedDecoration } from "./decor";

// ---- Shared movement (used by server simulation and client prediction) ----

export interface Vec2 {
  x: number;
  y: number;
}

/**
 * Advance a position by input direction over dt seconds, resolving collisions with stations / walls and world bounds.
 * `tiles` = the yard's synced tiles (walls and fences block).
 */
export function stepMovement(pos: Vec2, dx: number, dy: number, dtSeconds: number, tiles?: TileGetter): Vec2 {
  let nx = dx;
  let ny = dy;
  const len = Math.hypot(nx, ny);
  if (len > 0) {
    nx /= len;
    ny /= len;
  }
  return resolveCollisions({ x: pos.x + nx * PLAYER_SPEED * dtSeconds, y: pos.y + ny * PLAYER_SPEED * dtSeconds }, tiles);
}

/** Push a player circle at (x, y) out of a rectangle. */
function pushOutOfRect(x: number, y: number, rLeft: number, rTop: number, rRight: number, rBottom: number): Vec2 {
  const cx = Math.max(rLeft, Math.min(x, rRight));
  const cy = Math.max(rTop, Math.min(y, rBottom));
  const ox = x - cx;
  const oy = y - cy;
  const dist = Math.hypot(ox, oy);
  if (dist >= PLAYER_RADIUS) return { x, y };
  if (dist === 0) {
    // Center inside the rect: push out along the shortest axis.
    const left = x - rLeft;
    const right = rRight - x;
    const top = y - rTop;
    const bottom = rBottom - y;
    const m = Math.min(left, right, top, bottom);
    if (m === left) return { x: rLeft - PLAYER_RADIUS, y };
    if (m === right) return { x: rRight + PLAYER_RADIUS, y };
    if (m === top) return { x, y: rTop - PLAYER_RADIUS };
    return { x, y: rBottom + PLAYER_RADIUS };
  }
  const push = PLAYER_RADIUS - dist;
  return { x: x + (ox / dist) * push, y: y + (oy / dist) * push };
}

/** Stations of the room a position is in (none outdoors). */
export function stationsAt(p: Vec2): StationDef[] {
  const area = areaOf(p);
  return area === "shop" ? STATIONS : area === "restaurant" ? RESTAURANT_STATIONS : [];
}

/** Every station of both venues (the server keeps one synced Station per entry). */
export const ALL_STATIONS: StationDef[] = [...STATIONS, ...RESTAURANT_STATIONS];

/** Push a player circle out of stations (inside) or the buildings and built walls (outdoors), and clamp it inside its area. */
export function resolveCollisions(pos: Vec2, tiles?: TileGetter): Vec2 {
  const area = areaOf(pos);
  if (area === "yard") return resolveYardCollisions(pos, tiles);
  let { x, y } = pos;

  for (const s of area === "shop" ? STATIONS : RESTAURANT_STATIONS) {
    ({ x, y } = pushOutOfRect(x, y, s.x - s.width / 2, s.y - s.height / 2, s.x + s.width / 2, s.y + s.height / 2));
  }

  // Players can't walk up the back wall (their feet stay on the floor).
  const box = area === "shop" ? { x: 0, y: 0, width: WORLD_WIDTH, height: WORLD_HEIGHT } : RESTAURANT;
  x = Math.max(box.x + PLAYER_RADIUS, Math.min(box.x + box.width - PLAYER_RADIUS, x));
  y = Math.max(box.y + WALL_BOTTOM, Math.min(box.y + box.height - PLAYER_RADIUS, y));
  return { x, y };
}

function resolveYardCollisions(pos: Vec2, tiles?: TileGetter): Vec2 {
  let { x, y } = pos;
  for (const b of [SHOP_BUILDING, RESTAURANT_BUILDING]) ({ x, y } = pushOutOfRect(x, y, b.left, b.top, b.right, b.bottom));
  if (tiles) {
    // Only the cells the player circle can touch.
    const c0 = Math.floor((x - PLAYER_RADIUS - YARD.x) / BUILD_TILE);
    const c1 = Math.floor((x + PLAYER_RADIUS - YARD.x) / BUILD_TILE);
    const r0 = Math.floor((y - PLAYER_RADIUS - YARD.y) / BUILD_TILE);
    const r1 = Math.floor((y + PLAYER_RADIUS - YARD.y) / BUILD_TILE);
    for (let cy = r0; cy <= r1; cy++) {
      for (let cx = c0; cx <= c1; cx++) {
        for (const r of blockingRects(tiles, cx, cy)) ({ x, y } = pushOutOfRect(x, y, r.left, r.top, r.right, r.bottom));
      }
    }
  }
  x = Math.max(OUTDOOR.x + PLAYER_RADIUS, Math.min(OUTDOOR.x + OUTDOOR.width - PLAYER_RADIUS, x));
  y = Math.max(OUTDOOR.y + PLAYER_RADIUS, Math.min(OUTDOOR.y + OUTDOOR.height - PLAYER_RADIUS, y));
  return { x, y };
}

export function directionFromInput(dx: number, dy: number, fallback: Direction): Direction {
  if (dx === 0 && dy === 0) return fallback;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "down" : "up";
}

/** The point of a station rectangle closest to p (p itself if inside). */
function closestPointOnStation(p: Vec2, s: StationDef): Vec2 {
  return {
    x: Math.max(s.x - s.width / 2, Math.min(p.x, s.x + s.width / 2)),
    y: Math.max(s.y - s.height / 2, Math.min(p.y, s.y + s.height / 2)),
  };
}

/** Facing direction as a unit vector (undefined for anything that is not a valid Direction). */
function facingVector(facing: string | undefined): Vec2 | undefined {
  switch (facing) {
    case "up":
      return { x: 0, y: -1 };
    case "down":
      return { x: 0, y: 1 };
    case "left":
      return { x: -1, y: 0 };
    case "right":
      return { x: 1, y: 0 };
    default:
      return undefined;
  }
}

/** Distance from a point to the edge of a station rectangle (0 if inside). */
export function distanceToStation(p: Vec2, s: StationDef): number {
  const c = closestPointOnStation(p, s);
  return Math.hypot(p.x - c.x, p.y - c.y);
}

/**
 * Effective distance used to pick which station the action key acts on: stations whose closest point lies in front of
 * `facing` get FACING_BIAS off. An invalid or missing facing means no bias (plain distance).
 */
export function stationScore(p: Vec2, def: StationDef, facing?: string): number {
  const d = distanceToStation(p, def);
  const v = facingVector(facing);
  if (!v) return d;
  const c = closestPointOnStation(p, def);
  const inFront = (c.x - p.x) * v.x + (c.y - p.y) * v.y > 0;
  return inFront ? d - FACING_BIAS : d;
}

/** Nearest station within INTERACT_RANGE of a position (same rule on server and client). */
export function findNearestStationDef(p: Vec2, facing?: string): StationDef | undefined {
  let best: StationDef | undefined;
  let bestDist = INTERACT_RANGE;
  for (const def of stationsAt(p)) {
    const d = distanceToStation(p, def);
    if (d > INTERACT_RANGE) continue;
    const score = stationScore(p, def, facing);
    if (score <= bestDist) {
      bestDist = score;
      best = def;
    }
  }
  return best;
}

/** What the action key would act on: a station, a table where seated customers wait for drinks, or a bed. */
export type InteractTarget =
  | { type: "station"; def: StationDef }
  | { type: "table"; table: PlacedDecoration }
  | { type: "bed"; bed: BedSpot };

// ---------------------------------------------------------------- Beds

/**
 * A bed a player can lie in: furniture in the shop (id = decoration id) or a furniture prop built in the yard
 * (id = YARD_BED_PREFIX + its cell). Shaped like a placed decoration (kind = catalog kind, footprint centred on x, y,
 * artwork standing on the footprint's bottom edge) so footprintBox and the pillow maths work for both.
 */
export interface BedSpot extends PlacedDecoration {
  /** Where the sleeper's position is kept while lying (inside the bed's area: shop floor or the yard cell). */
  rest: Vec2;
  /** Drawing depth of the bed's artwork (the sleeper is drawn just above it). */
  depth: number;
}

export const YARD_BED_PREFIX = "yard:";

const isBed = (kind: string) => getDecorationDef(kind)?.role === "bed";

function shopBedSpot(d: PlacedDecoration): BedSpot {
  return { id: d.id, kind: d.kind, x: d.x, y: d.y, rotation: d.rotation, rest: { x: d.x, y: d.y }, depth: d.y };
}

/** The yard prop on structure tile `key`, if it's a bed. */
function yardBedSpot(key: string, buildKind: string | undefined): BedSpot | undefined {
  const decorKind = getBuildTile(buildKind)?.decor;
  const cell = parseTileKey(key);
  const def = decorKind ? getDecorationDef(decorKind) : undefined;
  if (!def || def.role !== "bed" || !cell || cell.layer !== "structure") return undefined;
  // Same place YardView draws the prop: bottom-centred on its anchor (yard props never turn).
  const at = propAnchor(cell.cx, cell.cy);
  const bottom = at.y + PROP_ART_DROP;
  return {
    id: `${YARD_BED_PREFIX}${cell.cx},${cell.cy}`,
    kind: def.kind,
    x: at.x,
    y: bottom - def.height / 2,
    rotation: 0,
    rest: { x: at.x, y: at.y - 8 },
    depth: at.y,
  };
}

/** Every bed: shop furniture plus yard props. `tiles` = the yard's synced tiles (key -> kind). */
export function bedSpots(decorations: Iterable<PlacedDecoration>, tiles?: Iterable<[string, string]>): BedSpot[] {
  const beds: BedSpot[] = [];
  for (const d of decorations) if (isBed(d.kind)) beds.push(shopBedSpot(d));
  for (const [key, kind] of tiles ?? []) {
    if (!kind.startsWith("decor_")) continue;
    const bed = yardBedSpot(key, kind);
    if (bed) beds.push(bed);
  }
  return beds;
}

/** The bed with this id, or undefined if it's gone (sold, erased, replaced). */
export function findBedSpot(id: string, decorations: Iterable<PlacedDecoration>, tiles: TileGetter): BedSpot | undefined {
  if (id.startsWith(YARD_BED_PREFIX)) {
    const [cx, cy] = id.slice(YARD_BED_PREFIX.length).split(",").map(Number);
    const key = tileKey(cx, cy, "structure");
    return yardBedSpot(key, tiles.get(key));
  }
  for (const d of decorations) if (d.id === id && isBed(d.kind)) return shopBedSpot(d);
  return undefined;
}

/** Where a player getting out of `bed` stands: just in front of it (then pushed out of stations / walls). */
export function bedExitPoint(bed: BedSpot, tiles?: TileGetter): Vec2 {
  const box = footprintBox(bed);
  return resolveCollisions({ x: bed.x, y: (box?.bottom ?? bed.y) + PLAYER_RADIUS + 4 }, tiles);
}

/**
 * Nearest station, table or bed within INTERACT_RANGE (same rule on server and client).
 * `tables` = only the tables that can be served right now (see tablesWaiting); `beds` = the shop's beds.
 * `facing` biases the station pick (see stationScore); tables and beds keep plain distances.
 */
export function findInteractTarget(
  p: Vec2,
  tables: Iterable<PlacedDecoration>,
  beds: Iterable<BedSpot> = [],
  facing?: string,
): InteractTarget | undefined {
  let best: InteractTarget | undefined;
  let bestDist = INTERACT_RANGE;
  for (const def of stationsAt(p)) {
    const d = distanceToStation(p, def);
    if (d > INTERACT_RANGE) continue;
    const score = stationScore(p, def, facing);
    if (score <= bestDist) {
      bestDist = score;
      best = { type: "station", def };
    }
  }
  for (const table of tables) {
    const box = footprintBox(table);
    const d = box ? distanceToBox(p, box) : Infinity;
    if (d <= bestDist) {
      bestDist = d;
      best = { type: "table", table };
    }
  }
  for (const bed of beds) {
    const box = footprintBox(bed);
    const d = box ? distanceToBox(p, box) : Infinity;
    if (d <= bestDist) {
      bestDist = d;
      best = { type: "bed", bed };
    }
  }
  return best;
}

export * from "./interaction";
