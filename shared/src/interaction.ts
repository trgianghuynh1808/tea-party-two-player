// Interaction rules shared by server (to apply them) and client (to preview the action
// on the action button / hint before the player presses it). Keep all rules here so both sides agree.

import {
  EMPTY_HAND,
  GamePhase,
  INGREDIENTS,
  StationType,
  cupContents,
  isCup,
  isValidPartial,
  makeCup,
  matchDrink,
  type MenuItem,
  type StationDef,
} from "./menu";
import {
  BURNT,
  CONTAINERS,
  FOODS,
  PROCESSES,
  canAddPart,
  containerOf,
  containerParts,
  describeKitchenItem,
  describePart,
  foodKey,
  isProcess,
  isKitchenStation,
  isUsefulFood,
  makeContainer,
  makeFood,
  matchDish,
  type ContainerId,
  type FoodId,
} from "./restaurant";
import { matchServed } from "./venues";

export interface InteractionContext {
  phase: string;
  /** Item in the player's hands ("" = empty). */
  held: string;
  /** Current item / progress on the station. */
  stationItem: string;
  stationProgress: number;
  /** Drink ids currently ordered by customers served here (delivery counter: take-away orders only). */
  orderedDrinkIds: string[];
  /** Delivery counter: drinks awaited by seated customers (to tell the player to take them to the table). */
  seatedDrinkIds?: string[];
}

export type InteractionPlan =
  | { ok: false; reason: string }
  | ({ ok: true; label: string } & (
      | { kind: "take_cup" }
      /** Instant machine: the held cup becomes `nextItem`. */
      | { kind: "add_ingredient"; nextItem: string }
      /** Timed machine: put the cup on the machine to process. */
      | { kind: "start_machine" }
      /** Take the cup from a machine or counter. */
      | { kind: "pick_up" }
      /** Put the held cup down on a counter. */
      | { kind: "put_down" }
      | { kind: "trash" }
      | { kind: "deliver"; item: MenuItem }
      /** Restaurant kitchen: what the player holds and what's on the station afterwards. `start` = a cooker starts working. */
      | { kind: "set"; held: string; station: string; start?: boolean }
    ));

const fail = (reason: string): InteractionPlan => ({ ok: false, reason });

export function planInteraction(def: StationDef, ctx: InteractionContext): InteractionPlan {
  const { held, stationItem, stationProgress } = ctx;
  if (ctx.phase === GamePhase.Ended) return fail("Ca đã kết thúc, bấm Chơi ca mới");
  // Restaurant counters / trash / take-away share the tea shop's types but follow the kitchen rules.
  if (isKitchenStation(def)) return planKitchen(def, ctx);

  switch (def.type) {
    case StationType.CupShelf:
      if (held !== EMPTY_HAND) return fail("Tay đang cầm đồ rồi");
      return { ok: true, kind: "take_cup", label: "Lấy ly" };

    case StationType.Machine: {
      const ingredient = def.ingredient!;
      const ingLabel = INGREDIENTS[ingredient].label;

      // Timed machine holding a cup: wait, then pick it up.
      if (stationItem !== EMPTY_HAND) {
        if (stationProgress < 1) return fail(`Máy ${ingLabel.toLowerCase()} đang chạy, chờ chút...`);
        if (held !== EMPTY_HAND) return fail("Tay đang cầm đồ, không lấy ly được");
        return { ok: true, kind: "pick_up", label: "Lấy ly ra" };
      }

      if (!isCup(held)) return fail(`Cần cầm ly để lấy ${ingLabel}`);
      const next = [...cupContents(held), ingredient];
      if (!isValidPartial(next)) {
        return fail(`Không có món nào thêm ${ingLabel} ở bước này (bỏ ly vào thùng rác để làm lại)`);
      }
      if (def.processSeconds && def.processSeconds > 0) {
        return { ok: true, kind: "start_machine", label: `Rót ${ingLabel}` };
      }
      return { ok: true, kind: "add_ingredient", nextItem: makeCup(next), label: `Thêm ${ingLabel}` };
    }

    case StationType.Trash:
      if (held === EMPTY_HAND) return fail("Tay đang trống");
      return { ok: true, kind: "trash", label: "Bỏ ly" };

    case StationType.Counter:
      if (held !== EMPTY_HAND && stationItem === EMPTY_HAND) return { ok: true, kind: "put_down", label: "Đặt xuống" };
      if (held === EMPTY_HAND && stationItem !== EMPTY_HAND) return { ok: true, kind: "pick_up", label: "Nhặt lên" };
      return fail(held === EMPTY_HAND ? "Bàn đang trống" : "Bàn đã có đồ rồi");

    case StationType.DeliveryCounter: {
      if (!isCup(held)) return fail("Cần cầm ly nước đã pha xong");
      const drink = matchDrink(cupContents(held));
      if (!drink) return fail("Món chưa pha xong");
      if (stationItem !== EMPTY_HAND) return fail("Quầy đang bận, chờ chút");
      if (ctx.phase !== GamePhase.Playing) return fail("Chưa mở ca, bấm Bắt đầu ca để đón khách");
      if (!ctx.orderedDrinkIds.includes(drink.id)) {
        return fail(ctx.seatedDrinkIds?.includes(drink.id) ? "Khách đang ngồi bàn, mang tới tận bàn nhé" : `Không có khách gọi ${drink.name}`);
      }
      return { ok: true, kind: "deliver", item: drink, label: `Giao ${drink.name}` };
    }

    default:
      return planKitchen(def, ctx);
  }
}

// ---------------------------------------------------------------- Restaurant kitchen

const set = (label: string, held: string, station: string, start = false): InteractionPlan => ({ ok: true, kind: "set", label, held, station, start });

/**
 * Put a finished part (`key`) into a container item, if some dish wants it there.
 * Returns the new container item, or undefined.
 */
function addToContainer(container: string, key: string): string | undefined {
  const c = containerOf(container);
  if (!c || key === BURNT) return undefined;
  const parts = containerParts(container);
  return canAddPart(c, parts, key) ? makeContainer(c, [...parts, key]) : undefined;
}

/**
 * Plating: the player brings the container to the food (on a counter, or finished on a cooker) and scoops it in.
 * Food is never carried to a container.
 */
function scoop(held: string, there: string): { held: string; station: string; label: string } | undefined {
  const thereKey = foodKey(there);
  const next = thereKey !== undefined ? addToContainer(held, thereKey) : undefined;
  if (!next || thereKey === undefined) return undefined;
  return { held: next, station: "", label: `Lấy ${describePart(thereKey).toLowerCase()} vào ${CONTAINERS[containerOf(held)!].label.toLowerCase()}` };
}

/** Holding food where a container is (shelf, plate on a counter): plating works the other way round. */
const BRING_CONTAINER = "Để món lại trên bếp / bàn, rồi cầm đĩa / tô / ly tới lấy";

/** Why `key` can't be added to `container` (or "" if it can). */
function containerRefusal(container: string, key: string): string {
  const c = containerOf(container)!;
  if (key === BURNT) return "Đồ cháy rồi, bỏ vào thùng rác thôi";
  // Some dish needs it after more cooking: tell the player it isn't ready yet.
  const somewhere = (["plate", "bowl", "glass"] as const).some((k) => addToContainer(k, key));
  if (!somewhere && isUsefulFood(key)) return `${describePart(key)} chưa nấu xong`;
  return `Không món nào cho ${describePart(key)} vào ${CONTAINERS[c].label.toLowerCase()} này`;
}

export function planKitchen(def: StationDef, ctx: InteractionContext): InteractionPlan {
  const { held, stationItem: there } = ctx;
  const heldKey = foodKey(held);
  const heldContainer = containerOf(held);

  switch (def.type) {
    case StationType.Crate: {
      const id = def.food as FoodId;
      const label = FOODS[id].label;
      if (held === EMPTY_HAND) return set(`Lấy ${label}`, makeFood(id), there);
      // Holding a container: add the raw ingredient straight in (milk in a glass, bread on a plate...).
      if (heldContainer) {
        const next = addToContainer(held, id);
        if (next) return set(`Cho ${label} vào ${CONTAINERS[heldContainer].label.toLowerCase()}`, next, there);
        return fail(`${label} chưa cho vào ${CONTAINERS[heldContainer].label.toLowerCase()} được, phải nấu trước`);
      }
      return fail("Tay đang cầm đồ rồi");
    }

    case StationType.Shelf: {
      const c = def.container as ContainerId;
      const label = CONTAINERS[c].label;
      if (held === EMPTY_HAND) return set(`Lấy ${label.toLowerCase()}`, c, there);
      return fail(heldKey !== undefined ? BRING_CONTAINER : "Tay đang cầm đồ rồi");
    }

    case StationType.Cooker: {
      const process = def.process;
      if (!process || !isProcess(process)) return fail("Máy hỏng");
      const p = PROCESSES[process];
      if (there !== EMPTY_HAND) {
        if (ctx.stationProgress < 1) return fail(`${p.station} đang ${p.done}, chờ chút...`);
        if (held === EMPTY_HAND) return set(`Lấy ${describeKitchenItem(there)}`, there, EMPTY_HAND);
        const both = heldContainer && scoop(held, there);
        if (both) return set(both.label, both.held, both.station);
        return fail(heldContainer ? containerRefusal(held, foodKey(there) ?? "") : "Tay đang cầm đồ, không lấy ra được");
      }
      if (heldContainer) return fail(`Chỉ cho nguyên liệu lên ${p.station.toLowerCase()}, không cho cả ${CONTAINERS[heldContainer].label.toLowerCase()}`);
      if (heldKey === undefined) return fail(`Cầm nguyên liệu tới để ${p.verb.toLowerCase()}`);
      if (heldKey === BURNT) return fail("Đồ cháy rồi, bỏ vào thùng rác thôi");
      if (!isUsefulFood(`${heldKey}.${process}`)) return fail(`Không món nào cần ${p.verb.toLowerCase()} ${describePart(heldKey).toLowerCase()}`);
      return set(`${p.verb} ${describePart(heldKey).toLowerCase()}`, EMPTY_HAND, held, true);
    }

    case StationType.Counter: {
      if (held === EMPTY_HAND && there === EMPTY_HAND) return fail("Bàn đang trống");
      if (held === EMPTY_HAND) return set("Nhặt lên", there, EMPTY_HAND);
      if (there === EMPTY_HAND) return set("Đặt xuống", EMPTY_HAND, held);
      const both = heldContainer && scoop(held, there);
      if (both) return set(both.label, both.held, both.station);
      if (heldContainer && foodKey(there) !== undefined) return fail(containerRefusal(held, foodKey(there)!));
      return fail(heldKey !== undefined && containerOf(there) ? BRING_CONTAINER : "Bàn đã có đồ rồi");
    }

    case StationType.Trash:
      if (held === EMPTY_HAND) return fail("Tay đang trống");
      // A container is emptied and kept; food is thrown away.
      if (heldContainer && containerParts(held).length) return set(`Đổ bỏ (giữ ${CONTAINERS[heldContainer].label.toLowerCase()})`, heldContainer, there);
      return set(heldContainer ? `Bỏ ${CONTAINERS[heldContainer].label.toLowerCase()}` : "Bỏ đi", EMPTY_HAND, there);

    case StationType.DeliveryCounter: {
      const dish = matchDish(held);
      if (!dish) return fail(heldContainer ? "Món chưa đủ, xem lại công thức" : "Cần bày món ra đĩa / tô / ly trước");
      if (there !== EMPTY_HAND) return fail("Quầy đang bận, chờ chút");
      if (ctx.phase !== GamePhase.Playing) return fail("Chưa mở ca, bấm Bắt đầu ca để đón khách");
      if (!ctx.orderedDrinkIds.includes(dish.id)) {
        return fail(ctx.seatedDrinkIds?.includes(dish.id) ? "Khách đang ngồi bàn, mang tới tận bàn nhé" : `Không có khách gọi ${dish.name}`);
      }
      return { ok: true, kind: "deliver", item: dish, label: `Giao ${dish.name}` };
    }
  }
  return fail("Không dùng được");
}

/** Lying down in a bed. `occupied` = someone else is already lying in it. */
export function planLieDown(ctx: { held: string; occupied: boolean }): InteractPlanSimple {
  if (ctx.occupied) return fail("Giường có người nằm rồi");
  if (ctx.held !== EMPTY_HAND) return fail("Đặt ly xuống trước rồi hẵng đi ngủ");
  return { ok: true, label: "Nằm nghỉ" };
}

/** Label of the action key while lying in bed (Space or walking gets up). */
export const GET_UP_LABEL = "Dậy";

export type InteractPlanSimple = { ok: false; reason: string } | { ok: true; label: string };

/** Serving a table: `orderedDrinkIds` = drinks still awaited by the customers sitting at it. */
export function planServeTable(ctx: Pick<InteractionContext, "phase" | "held" | "orderedDrinkIds">): InteractionPlan {
  if (ctx.phase === GamePhase.Ended) return fail("Ca đã kết thúc, bấm Chơi ca mới");
  if (ctx.held === EMPTY_HAND) return fail("Cần cầm món đã làm xong");
  const item = matchServed(ctx.held);
  if (!item) return fail("Món chưa làm xong");
  if (ctx.phase !== GamePhase.Playing) return fail("Chưa mở ca");
  if (!ctx.orderedDrinkIds.includes(item.id)) return fail(`Bàn này không gọi ${item.name}`);
  return { ok: true, kind: "deliver", item, label: `Mang ${item.name} ra bàn` };
}
