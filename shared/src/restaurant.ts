// The restaurant: a second venue next to the tea shop, with a real kitchen.
//
// How cooking works (the tea shop's "cup + ordered steps" idea, extended):
// - Crates hand out raw ingredients ("food:beef").
// - Cookers (board, pan, pot, grill, oven, fryer, blender, coffee machine) take ONE ingredient, work on it for a
//   few seconds and add their method to it ("food:beef.chop" -> "food:beef.chop.grill"). Hot cookers burn food
//   left on them too long ("food:burnt").
// - Shelves hand out containers (plate / bowl / glass). Finished parts are gathered in a container in any order
//   ("plate:beef.grill+potato.chop.boil"); a container that matches a dish exactly can be served.
// - Like the tea shop, every step is checked against the menu: you can't cook or plate something no dish uses.

import { type MenuItem, StationType, WALL_BOTTOM, type StationDef } from "./menu";
import type { PlacedDecoration } from "./decor";
import { RESTAURANT } from "./world";

// ---------------------------------------------------------------- Cooking methods

export type ProcessId = "chop" | "fry" | "boil" | "grill" | "bake" | "deepfry" | "blend" | "brew";

export interface ProcessDef {
  /** Past participle shown on items ("Bò thái"). */
  done: string;
  /** Action shown on the action button ("Thái Bò"). */
  verb: string;
  icon: string;
  /** Station name. */
  station: string;
  seconds: number;
  /** Hot cookers burn food left on them after it's done (see BURN_SECONDS). */
  burns: boolean;
  color: number;
}

export const PROCESSES: Record<ProcessId, ProcessDef> = {
  chop: { done: "thái", verb: "Thái", icon: "🔪", station: "Thớt", seconds: 2, burns: false, color: 0xd9b382 },
  fry: { done: "chiên", verb: "Chiên", icon: "🍳", station: "Chảo", seconds: 4, burns: true, color: 0x4a4e57 },
  boil: { done: "luộc", verb: "Luộc", icon: "🍲", station: "Nồi", seconds: 5, burns: true, color: 0x9aa7b4 },
  grill: { done: "nướng vỉ", verb: "Nướng vỉ", icon: "🔥", station: "Vỉ nướng", seconds: 4, burns: true, color: 0x3d3d3d },
  bake: { done: "nướng lò", verb: "Nướng lò", icon: "♨️", station: "Lò nướng", seconds: 6, burns: true, color: 0xb5543c },
  deepfry: { done: "chiên giòn", verb: "Chiên giòn", icon: "🍟", station: "Chảo dầu", seconds: 4, burns: true, color: 0xe9c46a },
  blend: { done: "xay", verb: "Xay", icon: "🌀", station: "Máy xay", seconds: 3, burns: false, color: 0x8ecae6 },
  brew: { done: "pha", verb: "Pha", icon: "☕", station: "Máy cà phê", seconds: 3, burns: false, color: 0x6d4c41 },
};
export const isProcess = (id: string): id is ProcessId => id in PROCESSES;

/** Food finished on a hot cooker burns if nobody takes it within this many seconds (during a shift). */
export const BURN_SECONDS = 8;

// ---------------------------------------------------------------- Ingredients

export type FoodId =
  | "beef"
  | "chicken"
  | "salmon"
  | "shrimp"
  | "egg"
  | "potato"
  | "tomato"
  | "lettuce"
  | "mushroom"
  | "pumpkin"
  | "rice"
  | "noodles"
  | "flour"
  | "bread"
  | "cheese"
  | "milk"
  | "coffee"
  | "orange"
  | "strawberry"
  | "lemon"
  | "chocolate";

export interface FoodDef {
  label: string;
  /** Artwork under client/public/ (cut by client/assets-src/tools/cut_food.py). */
  image: string;
  color: number;
}

const food = (label: string, color: number, image?: string): FoodDef => ({ label, color, image: image ?? "" });

export const FOODS: Record<FoodId, FoodDef> = {
  beef: food("Bò", 0xc0392b),
  chicken: food("Gà", 0xf4c7b8),
  salmon: food("Cá hồi", 0xf08a5d),
  shrimp: food("Tôm", 0xf4a6a0),
  egg: food("Trứng", 0xf7efe0),
  potato: food("Khoai tây", 0xc9a074),
  tomato: food("Cà chua", 0xe63946),
  lettuce: food("Rau xà lách", 0x8fc965),
  mushroom: food("Nấm", 0xe9e0d2),
  pumpkin: food("Bí đỏ", 0xf28c28),
  rice: food("Gạo", 0xf1e6d6),
  noodles: food("Mì sợi", 0xf2c45a),
  flour: food("Bột mì", 0xf6efe6),
  bread: food("Bánh mì", 0xd4a373),
  cheese: food("Phô mai", 0xffd166),
  milk: food("Sữa", 0xf5f0e1),
  coffee: food("Cà phê", 0x6d4c41, "assets/items/icons/coffee_beans.png"),
  orange: food("Cam", 0xf8961e),
  strawberry: food("Dâu", 0xe63946),
  lemon: food("Chanh", 0xf9e04b),
  chocolate: food("Sô cô la", 0x6d3b26),
};
for (const [id, def] of Object.entries(FOODS)) if (!def.image) def.image = `assets/food/ing_${id}.png`;
export const isFoodId = (id: string): id is FoodId => id in FOODS;

// ---------------------------------------------------------------- Containers

export type ContainerId = "plate" | "bowl" | "glass";
export const CONTAINERS: Record<ContainerId, { label: string; shelf: string }> = {
  plate: { label: "Đĩa", shelf: "Kệ đĩa" },
  bowl: { label: "Tô", shelf: "Kệ tô" },
  glass: { label: "Ly", shelf: "Kệ ly" },
};
export const isContainerId = (id: string): id is ContainerId => id in CONTAINERS;

// ---------------------------------------------------------------- Dishes

export interface DishDef extends MenuItem {
  container: ContainerId;
  /** What goes in the container (any order): "beef.grill" = beef, grilled; "milk" = milk as it comes. */
  parts: string[];
  /** Artwork of the finished dish. */
  image: string;
  /** Shift progress (0..1) from which customers start ordering it (harder dishes come later). */
  fromProgress: number;
}

const dish = (
  id: string,
  name: string,
  price: number,
  container: ContainerId,
  parts: string[],
  fromProgress = 0,
  image = `assets/food/${container === "glass" ? "drink" : "dish"}_${id}.png`,
): DishDef => ({ id, name, price, container, parts, fromProgress, image });

// Ids are stored in orders next to the tea shop's drink ids: keep them different.
export const DISHES: DishDef[] = [
  // Plates
  dish("fries", "Khoai tây chiên", 20, "plate", ["potato.chop.deepfry"]),
  dish("tempura", "Tôm tempura", 30, "plate", ["shrimp.deepfry"]),
  dish("roast_chicken", "Gà nướng lò", 35, "plate", ["chicken.bake"]),
  dish("fried_chicken", "Gà rán giòn", 32, "plate", ["chicken.chop.deepfry"], 0.1),
  dish("omurice", "Cơm trứng omurice", 35, "plate", ["rice.boil", "egg.fry"]),
  dish("sushi", "Sushi cá hồi", 38, "plate", ["rice.boil", "salmon.chop"]),
  dish("pancake", "Pancake dâu", 32, "plate", ["flour.fry", "strawberry.chop"], 0.1),
  dish("steak", "Bò bít tết khoai nghiền", 55, "plate", ["beef.grill", "potato.chop.boil"], 0.25),
  dish("spaghetti", "Mì Ý sốt cà chua", 45, "plate", ["noodles.boil", "tomato.chop.fry"], 0.25),
  dish("fish_chips", "Cá hồi chiên khoai tây", 55, "plate", ["salmon.chop.deepfry", "potato.chop.deepfry"], 0.35),
  dish("sandwich", "Bánh mì kẹp trứng", 45, "plate", ["bread.bake", "egg.fry", "lettuce.chop"], 0.35),
  dish("pizza", "Pizza phô mai cà chua", 55, "plate", ["flour.bake", "tomato.chop", "cheese.chop"], 0.45),
  dish("burger", "Hamburger bò phô mai", 65, "plate", ["bread", "beef.chop.grill", "lettuce.chop", "cheese.chop"], 0.55),
  // Bowls
  dish("salad", "Salad rau củ", 22, "bowl", ["lettuce.chop", "tomato.chop"]),
  dish("mushroom_soup", "Súp nấm kem", 30, "bowl", ["mushroom.chop.boil", "milk"]),
  dish("pumpkin_soup", "Súp bí đỏ", 30, "bowl", ["pumpkin.chop.boil", "milk"], 0.1),
  dish("beef_stew", "Bò hầm khoai tây", 50, "bowl", ["beef.chop.boil", "potato.chop.boil"], 0.3),
  dish("ramen", "Mì ramen bò", 60, "bowl", ["noodles.boil", "egg.boil", "beef.chop.fry"], 0.5),
  // Glasses
  dish("orange_juice", "Nước cam ép", 15, "glass", ["orange.blend"]),
  dish("lemonade", "Nước chanh tươi", 12, "glass", ["lemon.chop"]),
  dish("black_coffee", "Cà phê đen đá", 15, "glass", ["coffee.brew"]),
  dish("latte", "Cà phê latte", 20, "glass", ["coffee.brew", "milk"], 0.1),
  dish("strawberry_smoothie", "Sinh tố dâu sữa", 22, "glass", ["strawberry.blend", "milk"], 0.2),
  dish("hot_chocolate", "Sô cô la nóng", 25, "glass", ["milk.boil", "chocolate.chop"], 0.3),
];

export const getDish = (id: string) => DISHES.find((d) => d.id === id);
export const dishesAvailable = (progress: number) => DISHES.filter((d) => progress >= d.fromProgress);

// ---------------------------------------------------------------- Items
//
// Synced as strings (like the tea shop's cups):
//   "food:beef"                       raw ingredient
//   "food:beef.chop.grill"            ingredient after cooking steps
//   "food:burnt"                      burnt food (only good for the trash)
//   "plate" / "bowl" / "glass"        empty container
//   "plate:beef.grill+potato.chop"    container with finished parts (sorted, so equal plates compare equal)

const FOOD_PREFIX = "food:";
export const BURNT = "burnt";
export const BURNT_ITEM = FOOD_PREFIX + BURNT;

export const makeFood = (key: string) => FOOD_PREFIX + key;
export const isFoodItem = (item: string) => item.startsWith(FOOD_PREFIX);
/** "food:beef.chop" -> "beef.chop" (undefined if not a food). */
export const foodKey = (item: string) => (isFoodItem(item) ? item.slice(FOOD_PREFIX.length) : undefined);

export function parseFood(key: string): { food: FoodId; steps: ProcessId[] } | undefined {
  const [id, ...steps] = key.split(".");
  if (!isFoodId(id) || !steps.every(isProcess)) return undefined;
  return { food: id, steps: steps as ProcessId[] };
}

export function containerOf(item: string): ContainerId | undefined {
  const id = item.split(":")[0];
  return isContainerId(id) ? id : undefined;
}

export function containerParts(item: string): string[] {
  const i = item.indexOf(":");
  return containerOf(item) && i >= 0 ? item.slice(i + 1).split("+") : [];
}

export function makeContainer(container: ContainerId, parts: string[]): string {
  return parts.length ? `${container}:${[...parts].sort().join("+")}` : container;
}

export const isKitchenItem = (item: string) => isFoodItem(item) || !!containerOf(item);

/** Some dish uses this ingredient in this state, or after more cooking steps. */
export function isUsefulFood(key: string): boolean {
  return DISHES.some((d) => d.parts.some((p) => p === key || p.startsWith(key + ".")));
}

/** Can `part` go into a container already holding `parts`? (Some dish in that container needs all of them.) */
export function canAddPart(container: ContainerId, parts: string[], part: string): boolean {
  const wanted = [...parts, part];
  return DISHES.some((d) => {
    if (d.container !== container) return false;
    const left = [...d.parts];
    return wanted.every((p) => {
      const i = left.indexOf(p);
      if (i < 0) return false;
      left.splice(i, 1);
      return true;
    });
  });
}

/** The dish this container holds exactly, if any. */
export function matchDish(item: string): DishDef | undefined {
  const container = containerOf(item);
  if (!container) return undefined;
  const key = makeContainer(container, containerParts(item));
  return DISHES.find((d) => d.container === container && makeContainer(d.container, d.parts) === key);
}

/** The finished item of a dish (what's served / drawn in a customer's bubble). */
export const dishItem = (d: DishDef) => makeContainer(d.container, d.parts);

/** "Bò thái nướng vỉ" */
export function describePart(key: string): string {
  if (key === BURNT) return "Đồ cháy";
  const parsed = parseFood(key);
  if (!parsed) return key;
  return [FOODS[parsed.food].label, ...parsed.steps.map((s) => PROCESSES[s].done)].join(" ");
}

/** Human-readable label of a kitchen item ("Bò thái", "Đĩa: Cơm luộc + Trứng chiên", or the dish name). */
export function describeKitchenItem(item: string): string {
  const key = foodKey(item);
  if (key !== undefined) return describePart(key);
  const container = containerOf(item);
  if (!container) return "";
  const parts = containerParts(item);
  if (!parts.length) return `${CONTAINERS[container].label} trống`;
  return matchDish(item)?.name ?? `${CONTAINERS[container].label}: ${parts.map(describePart).join(" + ")}`;
}

// ---------------------------------------------------------------- Kitchen layout
//
// Local coordinates inside RESTAURANT (0,0 = top-left of the room). The back wall is y 0..WALL_BOTTOM.
// - Back wall: dish shelves and the cookers.
// - Left wall and a long island: ingredient crates.
// - Middle: counters to put things down and assemble dishes; take-away counter; trash in the corner.
// - Right: the dining room (tables + chairs below), with the door at the bottom.

const at = (x: number, y: number) => ({ x: RESTAURANT.x + x, y: RESTAURANT.y + y });
const BACK_Y = WALL_BOTTOM + 25;

const shelf = (container: ContainerId, x: number): StationDef => ({
  id: `r_shelf_${container}`,
  type: StationType.Shelf,
  label: CONTAINERS[container].shelf,
  ...at(x, BACK_Y),
  width: 84,
  height: 60,
  color: 0xe9dcc9,
  container,
});

const cooker = (process: ProcessId, n: number, x: number): StationDef => ({
  id: `r_${process}_${n}`,
  type: StationType.Cooker,
  label: PROCESSES[process].station,
  ...at(x, BACK_Y),
  width: 84,
  height: 60,
  color: PROCESSES[process].color,
  process,
});

const crate = (foodId: FoodId, x: number, y: number): StationDef => ({
  id: `r_crate_${foodId}`,
  type: StationType.Crate,
  label: FOODS[foodId].label,
  ...at(x, y),
  width: 54,
  height: 48,
  color: FOODS[foodId].color,
  food: foodId,
});

const BACK_ROW: (ContainerId | [ProcessId, number])[] = [
  "plate",
  "bowl",
  "glass",
  ["chop", 1],
  ["chop", 2],
  ["fry", 1],
  ["fry", 2],
  ["boil", 1],
  ["boil", 2],
  ["grill", 1],
  ["bake", 1],
  ["deepfry", 1],
  ["blend", 1],
  ["brew", 1],
];
const LEFT_CRATES: FoodId[] = ["beef", "chicken", "salmon", "shrimp", "egg", "milk", "cheese"];
const ISLAND_CRATES: FoodId[] = [
  "potato",
  "tomato",
  "lettuce",
  "mushroom",
  "pumpkin",
  "rice",
  "noodles",
  "flour",
  "bread",
  "coffee",
  "orange",
  "strawberry",
  "lemon",
  "chocolate",
];

export const RESTAURANT_STATIONS: StationDef[] = [
  ...BACK_ROW.map((s, i) => (typeof s === "string" ? shelf(s, 62 + i * 96) : cooker(s[0], s[1], 62 + i * 96))),
  ...LEFT_CRATES.map((f, i) => crate(f, 40, 240 + i * 66)),
  ...ISLAND_CRATES.map((f, i) => crate(f, 170 + i * 60, 330)),
  ...[0, 1, 2, 3, 4, 5].map(
    (i): StationDef => ({
      id: `r_counter_${i + 1}`,
      type: StationType.Counter,
      label: "Bàn",
      ...at(270 + i * 62, 500),
      width: 58,
      height: 58,
      color: 0xc9a27e,
    }),
  ),
  { id: "r_delivery", type: StationType.DeliveryCounter, label: "Mang đi", ...at(820, 640), width: 150, height: 80, color: 0x90be6d },
  { id: "r_trash", type: StationType.Trash, label: "Thùng rác", ...at(40, 712), width: 52, height: 52, color: 0x9e9e9e },
];

const KITCHEN_STATION_IDS = new Set(RESTAURANT_STATIONS.map((s) => s.id));
/**
 * A restaurant station: its counters, trash and take-away counter share their type with the tea shop's,
 * but follow the kitchen rules (plates, bowls, glasses) — see planKitchen.
 */
export const isKitchenStation = (def: StationDef) => KITCHEN_STATION_IDS.has(def.id);

/** The dining room's tables and chairs (fixed, not part of anyone's decorations). Chairs face their table. */
function diningTable(n: number, x: number, y: number): PlacedDecoration[] {
  const p = (dx: number, dy: number) => at(x + dx, y + dy);
  return [
    { id: `r_table_${n}`, kind: "table", ...p(0, 0), rotation: 0 },
    // Chair views: 0 front, 1 left, 2 back, 3 right (the way the sitter faces).
    { id: `r_seat_${n}_l`, kind: "chair", ...p(-46, 0), rotation: 3 },
    { id: `r_seat_${n}_r`, kind: "chair", ...p(46, 0), rotation: 1 },
    // Behind the table: the sitter faces the room, the table is drawn in front of them.
    { id: `r_seat_${n}_t`, kind: "chair", ...p(0, -44), rotation: 0 },
  ];
}

/** Pot plants and a lantern around the dining room. */
const diningDecor = (kind: string, x: number, y: number): PlacedDecoration => ({ id: `r_decor_${kind}`, kind, ...at(x, y) });

/**
 * The restaurant's own furniture (fixed: the host can't move it, but can add their own pieces around it).
 * Customers sit on these chairs; seats the host adds next to a table are used too.
 */
export const RESTAURANT_FURNITURE: PlacedDecoration[] = [
  ...diningTable(1, 1080, 400),
  ...diningTable(2, 1280, 400),
  ...diningTable(3, 1080, 580),
  ...diningTable(4, 1280, 580),
  diningDecor("fern_large", 1010, 690),
  diningDecor("banana_plant", 1375, 280),
  diningDecor("fiddle_leaf", 1010, 280),
  diningDecor("plant_tall_stand", 1370, 690),
  diningDecor("lantern_lit", 1180, 300),
];

/** Where players stand when a restaurant shift starts. */
export const RESTAURANT_SPAWN_POINTS = [at(420, 610), at(560, 610)];
