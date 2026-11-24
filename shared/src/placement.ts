// Where furniture can be placed: on the floor / back wall of the tea shop or of the restaurant.
// Shared by server (validation) and client (drag preview). Kept apart from decor.ts so it can use the
// restaurant and world modules without an import cycle.

import { WALL_SKIRTING, footprintOf, getDecorationDef, normalizeRotation, type PlacedDecoration } from "./decor";
import { STATIONS, WALL_BOTTOM, type StationDef } from "./menu";
import { RESTAURANT_STATIONS } from "./restaurant";
import { RESTAURANT, areaOf } from "./world";

export interface PlaceBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** A room players can decorate. */
export interface DecorRoom {
  area: "shop" | "restaurant";
  /** Floor furniture stays on the floor, below the back wall. */
  floor: PlaceBox;
  /** Wall pieces hang between the ceiling edge and the skirting board. */
  wall: PlaceBox;
  stations: StationDef[];
}

const room = (area: DecorRoom["area"], x: number, y: number, width: number, height: number, stations: StationDef[]): DecorRoom => ({
  area,
  floor: { minX: x, minY: y + WALL_BOTTOM, maxX: x + width, maxY: y + height },
  wall: { minX: x, minY: y + 4, maxX: x + width, maxY: y + WALL_BOTTOM - WALL_SKIRTING },
  stations,
});

export const DECOR_ROOMS: DecorRoom[] = [
  room("shop", 0, 0, 960, 600, STATIONS),
  room("restaurant", RESTAURANT.x, RESTAURANT.y, RESTAURANT.width, RESTAURANT.height, RESTAURANT_STATIONS),
];

/** The room a position is in (undefined outdoors). */
export const decorRoomAt = (p: { x: number; y: number }) => {
  const area = areaOf(p);
  return DECOR_ROOMS.find((r) => r.area === area);
};

/** Minimum gap between furniture and stations so machines stay easy to see and reach. */
const STATION_MARGIN = 6;

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
 * It must fit inside one room (tea shop or restaurant). `others` = the host's furniture; `ignoreId` = the piece being moved.
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
  const place = decorRoomAt({ x, y });
  if (!place) return false;

  const size = footprintOf(def, rotation);
  const r = rectOf(x, y, size.width, size.height);
  const area = def.layer === "wall" ? place.wall : place.floor;
  if (r.left < area.minX || r.top < area.minY || r.right > area.maxX || r.bottom > area.maxY) {
    return false;
  }

  // Wall pieces hang behind the machines (drawn below them), so stations don't block them.
  // Rugs lie flat on the floor and are drawn below everything (depth), so they may slide under
  // counters, tables and machines; standing furniture must keep clear of them.
  // Tabletop gadgets sit on a piece of furniture, never on the floor, so stations don't block them either.
  if (def.layer === "object") {
    for (const s of place.stations) {
      if (overlaps(r, rectOf(s.x, s.y, s.width, s.height, STATION_MARGIN))) return false;
    }
  }

  // A tabletop gadget must lie entirely on one piece with a top surface; the others loop below
  // then only rejects it where it stacks on another tabletop piece (same layer).
  if (def.layer === "tabletop" && !surfaceUnder(kind, x, y, others, rotation)) return false;

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

/**
 * The piece with a top surface that a tabletop piece of `kind` at (x, y) would lie on, if any:
 * its footprint (per its own rotation) must contain the gadget's whole footprint.
 * Shared by the server (placement rules) and the client (drag preview, depth).
 */
export function surfaceUnder(
  kind: string,
  x: number,
  y: number,
  others: Iterable<PlacedDecoration>,
  rotation = 0,
): PlacedDecoration | undefined {
  const def = getDecorationDef(kind);
  if (!def || def.layer !== "tabletop") return undefined;
  const size = footprintOf(def, rotation);
  const r = rectOf(x, y, size.width, size.height);
  for (const o of others) {
    const od = getDecorationDef(o.kind);
    if (!od?.surface) continue;
    const os = footprintOf(od, normalizeRotation(od, o.rotation));
    const s = rectOf(o.x, o.y, os.width, os.height);
    if (r.left >= s.left && r.right <= s.right && r.top >= s.top && r.bottom <= s.bottom) return o;
  }
  return undefined;
}

/** The tabletop pieces whose center lies within `table`'s footprint: they move and sell with the table. */
export function piecesOnSurface(table: PlacedDecoration, others: Iterable<PlacedDecoration>): PlacedDecoration[] {
  const td = getDecorationDef(table.kind);
  if (!td) return [];
  const ts = footprintOf(td, normalizeRotation(td, table.rotation));
  const r = rectOf(table.x, table.y, ts.width, ts.height);
  const on: PlacedDecoration[] = [];
  for (const o of others) {
    if (o.id === table.id) continue;
    const od = getDecorationDef(o.kind);
    if (!od || od.layer !== "tabletop") continue;
    if (o.x >= r.left && o.x <= r.right && o.y >= r.top && o.y <= r.bottom) on.push(o);
  }
  return on;
}
