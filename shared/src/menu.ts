// Drink menu, ingredients and machines. Edit this file to add/change drinks.
//
// How it works:
// - A cup is built step by step: each machine adds exactly one ingredient.
// - A drink recipe is an ordered list of ingredients.
// - Machines refuse a step that does not lead to any drink on the menu,
//   so a cup can never end up in an impossible state (use the trash bin to restart).

// ---------------------------------------------------------------- Ingredients

export type IngredientId = "black_tea" | "green_tea" | "milk" | "pearl" | "cheese_foam" | "passion";

export interface IngredientDef {
  label: string;
  short: string; // compact label for in-game bubbles
  color: number;
}

export const INGREDIENTS: Record<IngredientId, IngredientDef> = {
  black_tea: { label: "Trà đen", short: "Trà đen", color: 0x8b4a2b },
  green_tea: { label: "Trà xanh", short: "Trà xanh", color: 0x7cb342 },
  milk: { label: "Sữa", short: "Sữa", color: 0xf5f0e1 },
  pearl: { label: "Trân châu", short: "TC", color: 0x3e2723 },
  cheese_foam: { label: "Kem cheese", short: "Cheese", color: 0xffe082 },
  passion: { label: "Chanh dây", short: "C.dây", color: 0xffb300 },
};

// ---------------------------------------------------------------- Drinks

export interface DrinkDef {
  id: string;
  name: string;
  price: number;
  steps: IngredientId[]; // ordered recipe
  color: number; // cup color when finished
}

export const DRINKS: DrinkDef[] = [
  { id: "milk_tea_pearl", name: "Trà sữa trân châu", price: 30, steps: ["black_tea", "milk", "pearl"], color: 0xc69c6d },
  { id: "milk_tea_cheese", name: "Trà sữa kem cheese", price: 35, steps: ["black_tea", "milk", "cheese_foam"], color: 0xe0b97d },
  { id: "black_tea_cheese", name: "Hồng trà kem cheese", price: 28, steps: ["black_tea", "cheese_foam"], color: 0xb5651d },
  { id: "green_milk_tea", name: "Trà xanh sữa", price: 25, steps: ["green_tea", "milk"], color: 0xaed581 },
  { id: "passion_green_tea", name: "Trà xanh chanh dây", price: 25, steps: ["green_tea", "passion"], color: 0xdce775 },
];

export const getDrink = (id: string) => DRINKS.find((d) => d.id === id);

// ---------------------------------------------------------------- Stations / machines

export enum StationType {
  CupShelf = "cup_shelf",
  Machine = "machine",
  DeliveryCounter = "delivery_counter",
  Trash = "trash",
  /** Empty counter: put a cup down / pick it up, e.g. to hand it to your teammate. */
  Counter = "counter",
}

export interface StationDef {
  id: string;
  type: StationType;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: number;
  /** Machines only: ingredient this machine adds. */
  ingredient?: IngredientId;
  /** Machines only: 0 = instant; > 0 = cup is placed on the machine and must be picked up when done. */
  processSeconds?: number;
}

const MACHINE_Y = 92;
const MACHINE_W = 96;
const MACHINE_H = 60;
const machine = (id: IngredientId, x: number, label: string, processSeconds = 0): StationDef => ({
  id,
  type: StationType.Machine,
  label,
  x,
  y: MACHINE_Y,
  width: MACHINE_W,
  height: MACHINE_H,
  color: INGREDIENTS[id].color,
  ingredient: id,
  processSeconds,
});

export const STATIONS: StationDef[] = [
  { id: "cup_shelf", type: StationType.CupShelf, label: "Kệ ly", x: 76, y: MACHINE_Y, width: MACHINE_W, height: MACHINE_H, color: 0x8ecae6 },
  // Short labels so they stay readable on phones (the world is rendered at ~0.6× there).
  machine("black_tea", 196, "Trà đen", 1.5),
  machine("green_tea", 316, "Trà xanh", 1.5),
  machine("milk", 436, "Sữa"),
  machine("pearl", 556, "Trân châu"),
  machine("cheese_foam", 676, "Kem cheese", 1),
  machine("passion", 796, "Chanh dây"),
  { id: "delivery_counter", type: StationType.DeliveryCounter, label: "Giao hàng", x: 900, y: 340, width: 70, height: 170, color: 0x90be6d },
  { id: "trash", type: StationType.Trash, label: "Thùng rác", x: 52, y: 420, width: 56, height: 56, color: 0x9e9e9e },
  // Kitchen island made of empty counters, for passing cups between players.
  ...[0, 1, 2, 3, 4].map(
    (i): StationDef => ({
      id: `counter_${i + 1}`,
      type: StationType.Counter,
      label: "Bàn",
      x: 340 + i * 60,
      y: 300,
      width: 58,
      height: 58,
      color: 0xc9a27e,
    }),
  ),
];

// ---------------------------------------------------------------- Cups (held / placed items)
//
// Items are synced as strings:  ""  = nothing,  "cup" = empty cup,  "cup:black_tea,milk" = cup with contents.

export const EMPTY_HAND = "";
export const EMPTY_CUP = "cup";

export const isCup = (item: string) => item === EMPTY_CUP || item.startsWith(EMPTY_CUP + ":");

export function cupContents(item: string): IngredientId[] {
  if (!isCup(item) || item === EMPTY_CUP) return [];
  return item.slice(EMPTY_CUP.length + 1).split(",") as IngredientId[];
}

export function makeCup(contents: IngredientId[]): string {
  return contents.length ? `${EMPTY_CUP}:${contents.join(",")}` : EMPTY_CUP;
}

/** True if `contents` is the beginning of at least one recipe on the menu. */
export function isValidPartial(contents: IngredientId[]): boolean {
  return DRINKS.some((d) => contents.length <= d.steps.length && contents.every((c, i) => d.steps[i] === c));
}

/** The finished drink matching these contents exactly, if any. */
export function matchDrink(contents: IngredientId[]): DrinkDef | undefined {
  return DRINKS.find((d) => d.steps.length === contents.length && d.steps.every((s, i) => contents[i] === s));
}

/** Human-readable label for an item ("Ly rỗng", "Trà đen + Sữa", or the drink name). */
export function describeItem(item: string): string {
  if (!isCup(item)) return "";
  const contents = cupContents(item);
  if (contents.length === 0) return "Ly rỗng";
  return matchDrink(contents)?.name ?? contents.map((c) => INGREDIENTS[c].short).join(" + ");
}

/** Display color of a cup: finished drink color, else the last ingredient's color. */
export function cupColor(item: string): number {
  const contents = cupContents(item);
  if (contents.length === 0) return 0xffffff;
  return matchDrink(contents)?.color ?? INGREDIENTS[contents[contents.length - 1]].color;
}

// ---------------------------------------------------------------- Orders

export const ORDER_DURATION_SECONDS = 60;
export const ORDER_SPAWN_SECONDS = 9;
export const MAX_ACTIVE_ORDERS = 4;
/** Bonus when an order is served while more than half of its time is left. */
export const FAST_SERVICE_TIP = 5;

// ---------------------------------------------------------------- Shift (one round of play)

export enum GamePhase {
  /** Before the first shift: players can move and practice, no customers yet. */
  Waiting = "waiting",
  Playing = "playing",
  /** Shift over: results are shown until someone starts a new shift. */
  Ended = "ended",
}

export const SHIFT_SECONDS = 180;
/** Shift earnings needed for 1, 2 and 3 stars. */
export const STAR_THRESHOLDS = [100, 220, 350] as const;

export function starsFor(earnings: number): number {
  return STAR_THRESHOLDS.filter((t) => earnings >= t).length;
}
