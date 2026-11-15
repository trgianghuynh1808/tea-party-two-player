// Shared constants between server and client.

export const ROOM_NAME = "boba_shop";
export const SERVER_PORT = 2567;

// One shared shop: the first player opens it (creates the single room), everyone else joins it.
export const MAX_PLAYERS = 2;
/** Save id of the shared shop (money + furniture). */
export const SHARED_SHOP_ID = "shared-shop";
/** Matchmaking error code when the shop is already open and full (a second room is refused). */
export const SHOP_FULL_ERROR_CODE = 4210;

/** HTTP endpoint for the home screen: is the shop open, and how many players are inside. */
export const LOBBY_PATH = "/lobby";
export interface LobbyInfo {
  open: boolean;
  players: number;
  maxPlayers: number;
}

export const WORLD_WIDTH = 960;
export const WORLD_HEIGHT = 600;
export const PLAYER_RADIUS = 18;
export const PLAYER_SPEED = 200; // pixels per second
export const INTERACT_RANGE = 70; // max distance from player center to station edge

export type Direction = "up" | "down" | "left" | "right";

/** Character chosen in the lobby before entering a room. */
export type Gender = "male" | "female";
export const GENDERS: readonly Gender[] = ["male", "female"];
export const isGender = (v: unknown): v is Gender => v === "male" || v === "female";

export * from "./menu";
import { STATIONS, type StationDef } from "./menu";

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
} as const;

// Server -> client events
export const ServerEvents = {
  Delivered: "delivered",
  InteractFailed: "interact_failed",
  OrderExpired: "order_expired",
} as const;

export interface DeliveredEvent {
  by: string;
  drinkName: string;
  amount: number;
  tip: number;
}

export * from "./decor";

// ---- Shared movement (used by server simulation and client prediction) ----

export interface Vec2 {
  x: number;
  y: number;
}

/** Advance a position by input direction over dt seconds, resolving collisions with stations and world bounds. */
export function stepMovement(pos: Vec2, dx: number, dy: number, dtSeconds: number): Vec2 {
  let nx = dx;
  let ny = dy;
  const len = Math.hypot(nx, ny);
  if (len > 0) {
    nx /= len;
    ny /= len;
  }
  return resolveCollisions({ x: pos.x + nx * PLAYER_SPEED * dtSeconds, y: pos.y + ny * PLAYER_SPEED * dtSeconds });
}

/** Push a player circle out of station rectangles and clamp it inside the world. */
export function resolveCollisions(pos: Vec2): Vec2 {
  let { x, y } = pos;

  // Push the player circle out of station rectangles.
  for (const s of STATIONS) {
    const halfW = s.width / 2;
    const halfH = s.height / 2;
    const cx = Math.max(s.x - halfW, Math.min(x, s.x + halfW));
    const cy = Math.max(s.y - halfH, Math.min(y, s.y + halfH));
    const ox = x - cx;
    const oy = y - cy;
    const dist = Math.hypot(ox, oy);
    if (dist < PLAYER_RADIUS) {
      if (dist === 0) {
        // Center inside the rect: push out along the shortest axis.
        const left = x - (s.x - halfW);
        const right = s.x + halfW - x;
        const top = y - (s.y - halfH);
        const bottom = s.y + halfH - y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) x = s.x - halfW - PLAYER_RADIUS;
        else if (m === right) x = s.x + halfW + PLAYER_RADIUS;
        else if (m === top) y = s.y - halfH - PLAYER_RADIUS;
        else y = s.y + halfH + PLAYER_RADIUS;
      } else {
        const push = PLAYER_RADIUS - dist;
        x += (ox / dist) * push;
        y += (oy / dist) * push;
      }
    }
  }

  x = Math.max(PLAYER_RADIUS, Math.min(WORLD_WIDTH - PLAYER_RADIUS, x));
  y = Math.max(PLAYER_RADIUS, Math.min(WORLD_HEIGHT - PLAYER_RADIUS, y));
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

export * from "./interaction";
