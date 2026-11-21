import { Callbacks, type Room } from "@colyseus/sdk";
import {
  CONTAINERS,
  CustomerKind,
  DISHES,
  DRINKS,
  FOODS,
  INGREDIENTS,
  ORDER_DANGER_RATIO,
  PROCESSES,
  VIP_PRICE_MULTIPLIER,
  getCustomer,
  getDish,
  getDrink,
  getMenuItem,
  isDrinkServed,
  orderDrinkIds,
  parseFood,
  type ContainerId,
  type IngredientId,
  type MenuItem,
  type Venue,
} from "@boba/shared";
import type { BobaShopState, Order } from "@boba/shared/schema";

const hex = (color: number) => "#" + color.toString(16).padStart(6, "0");

/** Dark text on light ingredient colors, light text on dark ones. */
function chipTextColor(color: number): string {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#3d2c29" : "#ffffff";
}

function chip(text: string, color: number): HTMLElement {
  const el = document.createElement("span");
  el.className = "chip";
  el.textContent = text;
  el.style.background = hex(color);
  el.style.color = chipTextColor(color);
  return el;
}

const separator = (text: string) => Object.assign(document.createElement("span"), { className: "arrow", textContent: text });

/** Tea shop: ingredients in order (→). Restaurant: the container, then each part with its cooking steps (+, any order). */
function recipeSteps(item: MenuItem): HTMLElement {
  const steps = document.createElement("div");
  steps.className = "steps";
  const drink = getDrink(item.id);
  if (drink) {
    drink.steps.forEach((id: IngredientId, i) => {
      if (i > 0) steps.append(separator("→"));
      steps.append(chip(INGREDIENTS[id].label, INGREDIENTS[id].color));
    });
    return steps;
  }
  const dish = getDish(item.id);
  if (!dish) return steps;
  steps.append(chip(CONTAINERS[dish.container].label, 0xe9e4dc), separator(":"));
  dish.parts.forEach((part, i) => {
    const parsed = parseFood(part);
    if (!parsed) return;
    if (i > 0) steps.append(separator("+"));
    const how = parsed.steps.map((step) => PROCESSES[step].icon).join("");
    steps.append(chip(`${FOODS[parsed.food].label}${how ? " " + how : ""}`, FOODS[parsed.food].color));
  });
  return steps;
}

function menuEntry(item: MenuItem): HTMLElement {
  const el = Object.assign(document.createElement("div"), { className: "menu-item" });
  const title = Object.assign(document.createElement("div"), { className: "title" });
  title.append(
    Object.assign(document.createElement("span"), { textContent: item.name }),
    Object.assign(document.createElement("span"), { className: "price", textContent: `$${item.price}` }),
  );
  el.append(title, recipeSteps(item));
  return el;
}

const CONTAINER_TITLES: Record<ContainerId, string> = { plate: "🍽️ Món đĩa", bowl: "🥣 Món tô", glass: "🥤 Đồ uống" };

/**
 * The venue's menu with recipes (static). Used inline in the side panel and in the 📋 modal on phones.
 * Restaurant: a legend of the cooking methods, then the dishes grouped by container.
 */
export function buildMenu(venue: Venue = "shop"): HTMLElement {
  const menu = Object.assign(document.createElement("div"), { className: "menu" });
  if (venue === "shop") {
    for (const drink of DRINKS) menu.append(menuEntry(drink));
    return menu;
  }
  const legend = Object.assign(document.createElement("p"), {
    className: "hint",
    textContent:
      Object.values(PROCESSES)
        .map((p) => `${p.icon} ${p.station}`)
        .join(" · ") + ". Lấy đĩa / tô / ly ở kệ, gom đủ phần (thứ tự nào cũng được) rồi mang ra.",
  });
  menu.append(legend);
  for (const container of Object.keys(CONTAINERS) as ContainerId[]) {
    menu.append(Object.assign(document.createElement("h3"), { className: "menu-group", textContent: CONTAINER_TITLES[container] }));
    for (const dish of DISHES) if (dish.container === container) menu.append(menuEntry(dish));
  }
  return menu;
}

/** Live customer orders (synced from room state), each with its recipe and a countdown bar. */
export class OrdersPanel {
  private ordersList: HTMLElement;
  private emptyHint: HTMLElement;
  private cards = new Map<string, { card: HTMLElement; bar: HTMLElement }>();
  private unsubscribers: (() => void)[] = [];

  constructor(root: HTMLElement, room: Room<BobaShopState>) {
    root.replaceChildren();

    root.append(Object.assign(document.createElement("h2"), { textContent: "🧾 Đơn hàng" }));
    this.ordersList = Object.assign(document.createElement("div"), { className: "orders" });
    this.emptyHint = Object.assign(document.createElement("p"), { className: "hint", textContent: "Chưa có khách gọi món..." });
    root.append(this.ordersList, this.emptyHint);

    const $ = Callbacks.get(room);
    this.unsubscribers.push(
      $.onAdd("orders", (order) => this.addOrder($, order)),
      $.onRemove("orders", (order) => this.removeOrder(order.id)),
    );
  }

  destroy() {
    this.unsubscribers.forEach((off) => off());
    this.cards.clear();
  }

  private addOrder($: ReturnType<typeof Callbacks.get<BobaShopState>>, order: Order) {
    const drinks = orderDrinkIds(order.drinks)
      .map((id) => getMenuItem(id))
      .filter((d): d is MenuItem => !!d);
    if (!drinks.length) return;
    const kind = order.kind as CustomerKind;
    const customer = getCustomer(kind);

    const card = Object.assign(document.createElement("div"), { className: `order kind-${kind}` });
    if (kind !== CustomerKind.Normal) {
      const badge = Object.assign(document.createElement("div"), { className: "customer" });
      badge.append(
        Object.assign(document.createElement("span"), { className: "tag", textContent: `${customer.icon} ${customer.label}` }),
        Object.assign(document.createElement("span"), { className: "rule", textContent: customer.rule }),
      );
      card.append(badge);
    }

    // One block per drink (group orders have several); delivered ones get crossed out.
    const items = drinks.map((drink) => {
      const item = Object.assign(document.createElement("div"), { className: "order-drink" });
      const title = Object.assign(document.createElement("div"), { className: "title" });
      const price = kind === CustomerKind.Vip ? drink.price * VIP_PRICE_MULTIPLIER : drink.price;
      title.append(
        Object.assign(document.createElement("span"), { textContent: drink.name }),
        Object.assign(document.createElement("span"), { className: "price", textContent: `$${price}` }),
      );
      item.append(title, recipeSteps(drink));
      card.append(item);
      return item;
    });

    // Where to bring it: seated customers are served at their table, take-away ones at the delivery counter.
    card.append(
      Object.assign(document.createElement("div"), {
        className: "where",
        textContent: order.tableId ? `🪑 Ngồi bàn${drinks.length > 1 ? ` (${drinks.length} người)` : ""} · mang ra bàn` : "🥡 Mang đi · giao ở quầy",
      }),
    );

    const timer = Object.assign(document.createElement("div"), { className: "timer" });
    const bar = document.createElement("div");
    timer.append(bar);
    card.append(timer);

    this.ordersList.append(card);
    this.cards.set(order.id, { card, bar });
    this.emptyHint.hidden = true;

    this.unsubscribers.push(
      $.listen(order, "timeLeft", (timeLeft) => {
        const ratio = order.duration > 0 ? timeLeft / order.duration : 0;
        bar.style.width = `${Math.max(0, ratio) * 100}%`;
        bar.className = ratio > 0.5 ? "ok" : ratio > ORDER_DANGER_RATIO ? "warn" : "danger";
      }),
      $.listen(order, "servedMask", (mask) => {
        items.forEach((item, i) => item.classList.toggle("served", isDrinkServed(mask, i)));
      }),
    );
  }

  private removeOrder(id: string) {
    this.cards.get(id)?.card.remove();
    this.cards.delete(id);
    this.emptyHint.hidden = this.cards.size > 0;
  }
}
