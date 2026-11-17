// Seated customers: which seats can be used, which table serves them, and what each table is waiting for.
// Shared by server (seating customers, delivering) and client (drawing customers, previewing the action).

import { footprintOf, getDecorationDef, type PlacedDecoration } from "./decor";
import { pendingDrinkIds } from "./menu";

/** A seat belongs to a table when their footprints are at most this far apart (world px). */
export const SEAT_TABLE_GAP = 24;
/** A freed seat stays empty this long, so the next customer doesn't walk into the one leaving. */
export const SEAT_COOLDOWN_SECONDS = 4;
/** No free seat for a new customer: try again after this long. */
export const SEAT_RETRY_SECONDS = 2;
/** Share of customers who order take-away (served at the delivery counter) even when the shop has seats. */
export const TAKEAWAY_CHANCE = 0.3;

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const roleOf = (kind: string) => getDecorationDef(kind)?.role;

/** Floor footprint of a placed piece, as a box. */
export function footprintBox(d: PlacedDecoration): Box | undefined {
  const def = getDecorationDef(d.kind);
  if (!def) return undefined;
  const { width, height } = footprintOf(def, d.rotation ?? 0);
  return { left: d.x - width / 2, top: d.y - height / 2, right: d.x + width / 2, bottom: d.y + height / 2 };
}

/** Distance from a point to the edge of a box (0 if inside). */
export function distanceToBox(p: { x: number; y: number }, b: Box): number {
  const cx = Math.max(b.left, Math.min(p.x, b.right));
  const cy = Math.max(b.top, Math.min(p.y, b.bottom));
  return Math.hypot(p.x - cx, p.y - cy);
}

const gapBetween = (a: Box, b: Box) =>
  Math.hypot(Math.max(0, a.left - b.right, b.left - a.right), Math.max(0, a.top - b.bottom, b.top - a.bottom));

/**
 * Seat id -> id of the table that serves it (the nearest table within SEAT_TABLE_GAP).
 * Seats with no table next to them are left out: drinks can't be served there, so customers never sit on them.
 */
export function seatTableMap(decorations: Iterable<PlacedDecoration>): Map<string, string> {
  const seats: { id: string; box: Box }[] = [];
  const tables: { id: string; box: Box }[] = [];
  for (const d of decorations) {
    const role = roleOf(d.kind);
    const box = role && footprintBox(d);
    if (!box) continue;
    (role === "seat" ? seats : tables).push({ id: d.id, box });
  }
  const map = new Map<string, string>();
  for (const seat of seats) {
    let best: string | undefined;
    let bestGap = SEAT_TABLE_GAP;
    for (const table of tables) {
      const gap = gapBetween(seat.box, table.box);
      if (gap <= bestGap) {
        bestGap = gap;
        best = table.id;
      }
    }
    if (best) map.set(seat.id, best);
  }
  return map;
}

/** What the order sync carries for seating: `tableId` "" = take-away order, served at the delivery counter. */
export interface SeatedOrderLike {
  drinks: string;
  servedMask: number;
  tableId: string;
}

/** Drink ids still awaited at a table ("" = the take-away orders at the delivery counter). */
export function pendingDrinksAt(orders: Iterable<SeatedOrderLike>, tableId: string): string[] {
  const ids: string[] = [];
  for (const o of orders) if (o.tableId === tableId) ids.push(...pendingDrinkIds(o.drinks, o.servedMask));
  return ids;
}

/** Tables with at least one customer still waiting for a drink (only these can be served). */
export function tablesWaiting<T extends PlacedDecoration>(decorations: Iterable<T>, orders: Iterable<SeatedOrderLike>): T[] {
  const ids = new Set<string>();
  for (const o of orders) if (o.tableId && pendingDrinkIds(o.drinks, o.servedMask).length) ids.add(o.tableId);
  const tables: T[] = [];
  for (const d of decorations) if (ids.has(d.id)) tables.push(d);
  return tables;
}
