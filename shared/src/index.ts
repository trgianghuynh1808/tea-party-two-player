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

export type Direction = "up" | "down" | "left" | "right";

/** Character chosen in the lobby before entering a room. */
export * from "./characters";

export * from "./menu";
import { STATIONS, WALL_BOTTOM, type StationDef } from "./menu";

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
  StartShift: "start_shift",
  /** Go through the shop's door (inside <-> yard). The player must stand in the door zone. */
  UseDoor: "use_door",
  /** Build (or erase) yard tiles over a dragged rectangle of cells: BuildTilesMessage. */
  BuildTiles: "build_tiles",
} as const;

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
}

export * from "./decor";
export * from "./world";
import { BUILD_TILE, SHOP_BUILDING, YARD, blockingRects, isInYard, type TileGetter } from "./world";
export * from "./seating";
import { distanceToBox, footprintBox } from "./seating";
import type { PlacedDecoration } from "./decor";

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

/** Push a player circle out of stations (inside) or the shop building and built walls (yard), and clamp it inside its area. */
export function resolveCollisions(pos: Vec2, tiles?: TileGetter): Vec2 {
  if (isInYard(pos)) return resolveYardCollisions(pos, tiles);
  let { x, y } = pos;

  for (const s of STATIONS) {
    ({ x, y } = pushOutOfRect(x, y, s.x - s.width / 2, s.y - s.height / 2, s.x + s.width / 2, s.y + s.height / 2));
  }

  x = Math.max(PLAYER_RADIUS, Math.min(WORLD_WIDTH - PLAYER_RADIUS, x));
  // Players can't walk up the back wall (their feet stay on the floor).
  y = Math.max(WALL_BOTTOM, Math.min(WORLD_HEIGHT - PLAYER_RADIUS, y));
  return { x, y };
}

function resolveYardCollisions(pos: Vec2, tiles?: TileGetter): Vec2 {
  let { x, y } = pos;
  const b = SHOP_BUILDING;
  ({ x, y } = pushOutOfRect(x, y, b.left, b.top, b.right, b.bottom));
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
  x = Math.max(YARD.x + PLAYER_RADIUS, Math.min(YARD.x + YARD.width - PLAYER_RADIUS, x));
  y = Math.max(YARD.y + PLAYER_RADIUS, Math.min(YARD.y + YARD.height - PLAYER_RADIUS, y));
  return { x, y };
}

export function directionFromInput(dx: number, dy: number, fallback: Direction): Direction {
  if (dx === 0 && dy === 0) return fallback;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "down" : "up";
}

/** Distance from a point to the edge of a station rectangle (0 if inside). */
export function distanceToStation(p: Vec2, s: StationDef): number {
  const cx = Math.max(s.x - s.width / 2, Math.min(p.x, s.x + s.width / 2));
  const cy = Math.max(s.y - s.height / 2, Math.min(p.y, s.y + s.height / 2));
  return Math.hypot(p.x - cx, p.y - cy);
}

/** Nearest station within INTERACT_RANGE of a position (same rule on server and client). */
export function findNearestStationDef(p: Vec2): StationDef | undefined {
  let best: StationDef | undefined;
  let bestDist = INTERACT_RANGE;
  for (const def of STATIONS) {
    const d = distanceToStation(p, def);
    if (d <= bestDist) {
      bestDist = d;
      best = def;
    }
  }
  return best;
}

/** What the action key would act on: a station, or a table where seated customers wait for drinks. */
export type InteractTarget = { type: "station"; def: StationDef } | { type: "table"; table: PlacedDecoration };

/**
 * Nearest station or table within INTERACT_RANGE (same rule on server and client).
 * `tables` = only the tables that can be served right now (see tablesWaiting).
 */
export function findInteractTarget(p: Vec2, tables: Iterable<PlacedDecoration>): InteractTarget | undefined {
  let best: InteractTarget | undefined;
  let bestDist = INTERACT_RANGE;
  for (const def of STATIONS) {
    const d = distanceToStation(p, def);
    if (d <= bestDist) {
      bestDist = d;
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
  return best;
}

export * from "./interaction";
