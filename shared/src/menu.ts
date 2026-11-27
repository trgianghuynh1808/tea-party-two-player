// Drink menu, ingredients and machines. Edit this file to add/change drinks.
//
// How it works:
// - A cup is built step by step: each machine adds exactly one ingredient.
// - A drink recipe is an ordered list of ingredients.
// - Machines refuse a step that does not lead to any drink on the menu,
//   so a cup can never end up in an impossible state (use the trash bin to restart).

// ---------------------------------------------------------------- Ingredients

export type IngredientId =
  | "black_tea"
  | "green_tea"
  | "milk"
  | "pearl"
  | "cheese_foam"
  | "passion"
  | "orange"
  | "watermelon"
  | "lemon";

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
  orange: { label: "Cam", short: "Cam", color: 0xff9800 },
  watermelon: { label: "Dưa hấu", short: "D.hấu", color: 0xf06292 },
  lemon: { label: "Chanh", short: "Chanh", color: 0xcddc39 },
};

// ---------------------------------------------------------------- Drinks

/** Anything a customer can order (tea shop drinks, restaurant dishes): see getMenuItem. */
export interface MenuItem {
  id: string;
  name: string;
  price: number;
}

export interface DrinkDef extends MenuItem {
  steps: IngredientId[]; // ordered recipe
  color: number; // cup color when finished
}

export const DRINKS: DrinkDef[] = [
  { id: "milk_tea_pearl", name: "Trà sữa trân châu", price: 30, steps: ["black_tea", "milk", "pearl"], color: 0xc69c6d },
  { id: "milk_tea_cheese", name: "Trà sữa kem cheese", price: 35, steps: ["black_tea", "milk", "cheese_foam"], color: 0xe0b97d },
  { id: "black_tea_cheese", name: "Hồng trà kem cheese", price: 28, steps: ["black_tea", "cheese_foam"], color: 0xb5651d },
  { id: "green_milk_tea", name: "Trà xanh sữa", price: 25, steps: ["green_tea", "milk"], color: 0xaed581 },
  { id: "passion_green_tea", name: "Trà xanh chanh dây", price: 25, steps: ["green_tea", "passion"], color: 0xdce775 },
  // Fruit juices: id "juice_orange" instead of "orange_juice", which is already a restaurant dish id.
  { id: "juice_orange", name: "Nước cam", price: 20, steps: ["orange"], color: 0xff9800 },
  { id: "watermelon_juice", name: "Nước dưa hấu", price: 20, steps: ["watermelon"], color: 0xf06292 },
  { id: "lemonade", name: "Nước chanh", price: 18, steps: ["lemon"], color: 0xcddc39 },
  { id: "orange_lemon", name: "Cam chanh", price: 26, steps: ["orange", "lemon"], color: 0xffb74d },
  { id: "watermelon_milk", name: "Dưa hấu sữa", price: 28, steps: ["watermelon", "milk"], color: 0xf8bbd0 },
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
  // Restaurant kitchen (see restaurant.ts)
  /** Ingredient crate: take one raw ingredient. */
  Crate = "crate",
  /** Cooking appliance (board, pan, pot, oven...): processes one ingredient over time. */
  Cooker = "cooker",
  /** Stack of plates / bowls / glasses. */
  Shelf = "shelf",
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
  /** Restaurant crates: ingredient handed out (FoodId). */
  food?: string;
  /** Restaurant cookers: cooking method (ProcessId); timing comes from PROCESSES. */
  process?: string;
  /** Restaurant shelves: container handed out (ContainerId). */
  container?: string;
}

/**
 * The shop's back wall is the strip y = 0..WALL_BOTTOM (seen face-on, top-down 3/4 view).
 * Players and floor furniture stay below it; wall decorations (paintings) hang on it.
 */
export const WALL_BOTTOM = 120;

/** Machines stand against the back wall (their top edge slightly overlaps the skirting board). */
const MACHINE_Y = WALL_BOTTOM + 25;
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
  // The nine machines fill the whole back wall, so both cup shelves stand on the floor instead, one by
  // the left wall and one by the right wall near the juice machines: clear of the machines, the trash
  // bin, the counters, the delivery stall, the exit path and both spawns.
  { id: "cup_shelf", type: StationType.CupShelf, label: "Kệ ly", x: 76, y: 290, width: MACHINE_W, height: MACHINE_H, color: 0x8ecae6 },
  { id: "cup_shelf_2", type: StationType.CupShelf, label: "Kệ ly", x: 884, y: 290, width: MACHINE_W, height: MACHINE_H, color: 0x8ecae6 },
  // Short labels so they stay readable on phones (the world is rendered at ~0.6× there).
  // Nine machines 102px apart: teas | shared milk in the middle (i=5) | fruit juices.
  machine("black_tea", 60, "Trà đen", 1.5),
  machine("green_tea", 162, "Trà xanh", 1.5),
  machine("pearl", 264, "Trân châu"),
  machine("cheese_foam", 366, "Kem cheese", 1),
  machine("passion", 468, "Chanh dây"),
  machine("milk", 570, "Sữa"),
  machine("orange", 672, "Cam", 1.5),
  machine("watermelon", 774, "Dưa hấu", 1.5),
  machine("lemon", 876, "Chanh", 1.5),
  // Horizontal market stall in the bottom-right corner (art is ~1.9:1, see client/public/assets/stations/stall_checkered.png).
  { id: "delivery_counter", type: StationType.DeliveryCounter, label: "Giao hàng", x: 850, y: 450, width: 180, height: 95, color: 0x90be6d },
  { id: "trash", type: StationType.Trash, label: "Thùng rác", x: 52, y: 420, width: 56, height: 56, color: 0x9e9e9e },
  // Kitchen island made of empty counters, for passing cups between players.
  ...[0, 1, 2, 3, 4].map(
    (i): StationDef => ({
      id: `counter_${i + 1}`,
      type: StationType.Counter,
      label: "Bàn",
      x: 260 + i * 100,
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

// Difficulty ramps up during a shift: customers come more often and wait less.
// `progress` = fraction of the shift already played (0 at the start, 1 at closing time).
export const ORDER_DURATION_START = 60;
export const ORDER_DURATION_END = 35;
export const ORDER_SPAWN_START = 9;
export const ORDER_SPAWN_END = 5;
export const MAX_ACTIVE_ORDERS = 4;
/** Bonus per drink when an order is served while more than half of its time is left. */
export const FAST_SERVICE_TIP = 5;
/** Taken from shift earnings (and the shop's money) when a customer walks out. */
export const MISSED_ORDER_PENALTY = 10;

const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t));
export const orderSpawnInterval = (progress: number) => lerp(ORDER_SPAWN_START, ORDER_SPAWN_END, progress);
export const baseOrderDuration = (progress: number) => lerp(ORDER_DURATION_START, ORDER_DURATION_END, progress);

/** Combo = orders completed in a row without any customer walking out. Bonus = share of the order's pay. */
export const COMBO_TIERS = [
  { min: 6, bonus: 0.5 },
  { min: 3, bonus: 0.2 },
] as const;
export const comboBonusRate = (combo: number) => COMBO_TIERS.find((t) => combo >= t.min)?.bonus ?? 0;

export enum CustomerKind {
  Normal = "normal",
  /** Pays double, but only waits a short, fixed time. */
  Vip = "vip",
  /** Orders several drinks and pays only once all of them are delivered. */
  Group = "group",
  /** Big bonus if served fast, only half price if served late. */
  Picky = "picky",
}

export interface CustomerDef {
  label: string;
  icon: string;
  /** Short rule shown on the order card. */
  rule: string;
  /** Relative spawn chance. */
  weight: number;
  /** Shift progress (0..1) from which this customer starts to show up. */
  fromProgress: number;
}

export const CUSTOMERS: Record<CustomerKind, CustomerDef> = {
  [CustomerKind.Normal]: { label: "Khách", icon: "🙂", rule: "", weight: 6, fromProgress: 0 },
  [CustomerKind.Picky]: { label: "Khó tính", icon: "🧐", rule: "Nhanh: +$10 · Chậm: nửa giá", weight: 1.5, fromProgress: 0.1 },
  [CustomerKind.Vip]: { label: "VIP", icon: "👑", rule: "Trả gấp đôi, chờ rất ít", weight: 1.5, fromProgress: 0.2 },
  [CustomerKind.Group]: { label: "Nhóm", icon: "👨‍👩‍👧", rule: "Trả tiền khi đủ món", weight: 2, fromProgress: 0.3 },
};

export const VIP_DURATION_SECONDS = 35;
export const VIP_PRICE_MULTIPLIER = 2;
export const PICKY_FAST_BONUS = 10;
/** Group orders: extra waiting time per extra drink, as a share of the base duration. */
export const GROUP_EXTRA_TIME_PER_DRINK = 0.6;

export function pickCustomerKind(progress: number, random = Math.random): CustomerKind {
  const kinds = (Object.keys(CUSTOMERS) as CustomerKind[]).filter((k) => progress >= CUSTOMERS[k].fromProgress);
  let roll = random() * kinds.reduce((sum, k) => sum + CUSTOMERS[k].weight, 0);
  for (const k of kinds) {
    roll -= CUSTOMERS[k].weight;
    if (roll < 0) return k;
  }
  return CustomerKind.Normal;
}

/** Order timer bar turns red below this share of time left: customers leaving then are unhappy. */
export const ORDER_DANGER_RATIO = 0.25;

export const getCustomer = (kind: string): CustomerDef => CUSTOMERS[kind as CustomerKind] ?? CUSTOMERS[CustomerKind.Normal];

/** Order drinks are synced as a comma-separated list of drink ids; `servedMask` bit i = drink i delivered. */
export const orderDrinkIds = (drinks: string): string[] => (drinks ? drinks.split(",") : []);
export const isDrinkServed = (servedMask: number, index: number) => (servedMask & (1 << index)) !== 0;
export const pendingDrinkIds = (drinks: string, servedMask: number): string[] =>
  orderDrinkIds(drinks).filter((_, i) => !isDrinkServed(servedMask, i));

/**
 * Drink ids still awaited by any of these orders.
 * Iterates instead of using flatMap: Colyseus ArraySchema throws on flatMap() / flat().
 */
export function pendingOrderDrinkIds(orders: Iterable<{ drinks: string; servedMask: number }>): string[] {
  const ids: string[] = [];
  for (const o of orders) ids.push(...pendingDrinkIds(o.drinks, o.servedMask));
  return ids;
}

// ---------------------------------------------------------------- Timed machines

/** A finished cup left on a timed machine spills (and is lost) after this many seconds. */
export const MACHINE_OVERFLOW_SECONDS = 6;

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
