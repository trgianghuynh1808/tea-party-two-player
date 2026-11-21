// Where furniture can be placed: on the floor / back wall of the tea shop or of the restaurant.
// Shared by server (validation) and client (drag preview). Kept apart from decor.ts so it can use the
// restaurant and world modules without an import cycle.

import { WALL_SKIRTING, footprintOf, getDecorationDef, type PlacedDecoration } from "./decor";
import { STATIONS, WALL_BOTTOM, type StationDef } from "./menu";
import { RESTAURANT_FURNITURE, RESTAURANT_STATIONS } from "./restaurant";
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
  /** Fixed furniture of the room (the restaurant's dining tables and plants): nothing goes on top of it. */
  fixed: PlacedDecoration[];
}

const room = (area: DecorRoom["area"], x: number, y: number, width: number, height: number, stations: StationDef[], fixed: PlacedDecoration[]): DecorRoom => ({
  area,
  floor: { minX: x, minY: y + WALL_BOTTOM, maxX: x + width, maxY: y + height },
  wall: { minX: x, minY: y + 4, maxX: x + width, maxY: y + WALL_BOTTOM - WALL_SKIRTING },
  stations,
  fixed,
});

export const DECOR_ROOMS: DecorRoom[] = [
  room("shop", 0, 0, 960, 600, STATIONS, []),
  room("restaurant", RESTAURANT.x, RESTAURANT.y, RESTAURANT.width, RESTAURANT.height, RESTAURANT_STATIONS, RESTAURANT_FURNITURE),
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
  if (def.layer === "object") {
    for (const s of place.stations) {
      if (overlaps(r, rectOf(s.x, s.y, s.width, s.height, STATION_MARGIN))) return false;
    }
  }

  for (const o of [...others, ...place.fixed]) {
    if (o.id === ignoreId) continue;
    const od = getDecorationDef(o.kind);
    // Furniture may sit on a rug, but rugs don't stack and furniture doesn't stack.
    if (!od || od.layer !== def.layer) continue;
    const os = footprintOf(od, o.rotation ?? 0);
    if (overlaps(r, rectOf(o.x, o.y, os.width, os.height))) return false;
  }
  return true;
}
