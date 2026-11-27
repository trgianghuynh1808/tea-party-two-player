// The two places a shift can be played in: the tea shop and the restaurant.
// Each has its own menu, pace and star goals; everything else (orders, customers, combo, pay) is shared.

import { DRINKS, cupContents, describeItem, getDrink, isCup, makeCup, matchDrink, type MenuItem } from "./menu";
import { describeKitchenItem, dishItem, dishesAvailable, getDish, isKitchenItem, matchDish } from "./restaurant";

export type Venue = "shop" | "restaurant";
export const isVenue = (v: unknown): v is Venue => v === "shop" || v === "restaurant";

export interface VenueDef {
  id: Venue;
  name: string;
  icon: string;
  /** "ly" / "món" in the shift results. */
  unit: string;
  shiftSeconds: number;
  /** Customers come every `spawnStart` → `spawnEnd` seconds and wait `durationStart` → `durationEnd` seconds over the shift. */
  spawnStart: number;
  spawnEnd: number;
  durationStart: number;
  durationEnd: number;
  maxOrders: number;
  /** Shift earnings needed for 1, 2 and 3 stars. */
  stars: readonly [number, number, number];
}

export const VENUES: Record<Venue, VenueDef> = {
  shop: {
    id: "shop",
    name: "Tiệm trà",
    icon: "🧋",
    unit: "ly",
    shiftSeconds: 240,
    spawnStart: 11,
    spawnEnd: 7,
    durationStart: 85,
    durationEnd: 55,
    maxOrders: 4,
    stars: [120, 260, 420],
  },
  restaurant: {
    id: "restaurant",
    name: "Nhà hàng",
    icon: "🍽️",
    unit: "món",
    shiftSeconds: 240,
    spawnStart: 16,
    spawnEnd: 10,
    durationStart: 100,
    durationEnd: 70,
    maxOrders: 4,
    stars: [150, 350, 550],
  },
};

export const getVenue = (v: string): VenueDef => VENUES[isVenue(v) ? v : "shop"];
export const venueStars = (venue: string, earnings: number) => getVenue(venue).stars.filter((t) => earnings >= t).length;

const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t));
export const venueSpawnInterval = (venue: string, progress: number) => {
  const v = getVenue(venue);
  return lerp(v.spawnStart, v.spawnEnd, progress);
};
export const venueOrderDuration = (venue: string, progress: number) => {
  const v = getVenue(venue);
  return lerp(v.durationStart, v.durationEnd, progress);
};

/** What customers may order at this point of a shift. */
export function venueMenu(venue: string, progress = 1): MenuItem[] {
  return venue === "restaurant" ? dishesAvailable(progress) : DRINKS;
}

/** A drink or a dish, by id. */
export const getMenuItem = (id: string): MenuItem | undefined => getDrink(id) ?? getDish(id);

/** The finished menu item a held cup / container is, if any. */
export function matchServed(item: string): MenuItem | undefined {
  if (isCup(item)) return matchDrink(cupContents(item));
  return matchDish(item);
}

/** The item a finished order looks like (customer bubbles, served on the table). */
export function servedItemFor(id: string): string {
  const drink = getDrink(id);
  if (drink) return makeCup(drink.steps);
  const dish = getDish(id);
  return dish ? dishItem(dish) : "";
}

/** Label of anything a player can hold. */
export const describeAnyItem = (item: string) => (isKitchenItem(item) ? describeKitchenItem(item) : describeItem(item));
