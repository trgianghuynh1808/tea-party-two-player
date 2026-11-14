// Shared constants between server and client.

export const ROOM_NAME = "boba_shop";
export const SERVER_PORT = 2567;

// Room codes: short, uppercase, without easily confused characters (0/O, 1/I/L).
export const ROOM_CODE_LENGTH = 4;
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function normalizeRoomCode(input: string): string {
  return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export const WORLD_WIDTH = 960;
export const WORLD_HEIGHT = 600;
export const PLAYER_RADIUS = 18;
export const PLAYER_SPEED = 200; // pixels per second
export const INTERACT_RANGE = 70; // max distance from player center to station edge

export type Direction = "up" | "down" | "left" | "right";

export enum StationType {
  CupShelf = "cup_shelf",
  TeaDispenser = "tea_dispenser",
  PearlPot = "pearl_pot",
  DeliveryCounter = "delivery_counter",
}

// Item progression: "" -> cup -> cup_tea -> cup_tea_pearl -> delivered
export enum Item {
  None = "",
  Cup = "cup",
  CupTea = "cup_tea",
  CupTeaPearl = "cup_tea_pearl",
}

export const ITEM_LABELS: Record<string, string> = {
  [Item.None]: "",
  [Item.Cup]: "Ly",
  [Item.CupTea]: "Trà",
  [Item.CupTeaPearl]: "Trà sữa TC",
};

export const DRINK_PRICE = 25;

export interface StationDef {
  id: string;
  type: StationType;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: number;
}

export const STATIONS: StationDef[] = [
  { id: "cup_shelf", type: StationType.CupShelf, label: "Kệ ly", x: 160, y: 110, width: 120, height: 60, color: 0x8ecae6 },
  { id: "tea_dispenser", type: StationType.TeaDispenser, label: "Bình trà", x: 380, y: 110, width: 120, height: 60, color: 0xd4a373 },
  { id: "pearl_pot", type: StationType.PearlPot, label: "Nồi trân châu", x: 600, y: 110, width: 120, height: 60, color: 0x6d4c41 },
  { id: "delivery_counter", type: StationType.DeliveryCounter, label: "Quầy giao hàng", x: 820, y: 300, width: 80, height: 160, color: 0x90be6d },
];

// Message payloads (client -> server)
export interface MoveMessage {
  dx: number; // -1, 0, 1
  dy: number; // -1, 0, 1
}

export const Messages = {
  Move: "move",
  Interact: "interact",
  BuyDecoration: "buy_decoration",
} as const;

// Server -> client events
export const ServerEvents = {
  Delivered: "delivered",
  InteractFailed: "interact_failed",
} as const;

export interface DecorationDef {
  kind: string;
  label: string;
  price: number;
  color: number;
}

export const DECORATION_CATALOG: DecorationDef[] = [
  { kind: "plant", label: "Chậu cây", price: 50, color: 0x2a9d8f },
  { kind: "lamp", label: "Đèn lồng", price: 75, color: 0xf4a261 },
];

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
  let x = pos.x + nx * PLAYER_SPEED * dtSeconds;
  let y = pos.y + ny * PLAYER_SPEED * dtSeconds;

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
