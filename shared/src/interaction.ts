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
  type DrinkDef,
  type StationDef,
} from "./menu";

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
      | { kind: "deliver"; drink: DrinkDef }
    ));

const fail = (reason: string): InteractionPlan => ({ ok: false, reason });

export function planInteraction(def: StationDef, ctx: InteractionContext): InteractionPlan {
  const { held, stationItem, stationProgress } = ctx;
  if (ctx.phase === GamePhase.Ended) return fail("Ca đã kết thúc, bấm Chơi ca mới");

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
      return { ok: true, kind: "deliver", drink, label: `Giao ${drink.name}` };
    }
  }
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
  if (!isCup(ctx.held)) return fail("Cần cầm ly nước đã pha xong");
  const drink = matchDrink(cupContents(ctx.held));
  if (!drink) return fail("Món chưa pha xong");
  if (ctx.phase !== GamePhase.Playing) return fail("Chưa mở ca");
  if (!ctx.orderedDrinkIds.includes(drink.id)) return fail(`Bàn này không gọi ${drink.name}`);
  return { ok: true, kind: "deliver", drink, label: `Mang ${drink.name} ra bàn` };
}
