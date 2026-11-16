import { Callbacks, type Room } from "@colyseus/sdk";
import {
  CustomerKind,
  DRINKS,
  INGREDIENTS,
  VIP_PRICE_MULTIPLIER,
  getCustomer,
  getDrink,
  isDrinkServed,
  orderDrinkIds,
  type DrinkDef,
  type IngredientId,
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

function recipeSteps(drink: DrinkDef): HTMLElement {
  const steps = document.createElement("div");
  steps.className = "steps";
  drink.steps.forEach((id: IngredientId, i) => {
    if (i > 0) steps.append(Object.assign(document.createElement("span"), { className: "arrow", textContent: "→" }));
    const ing = INGREDIENTS[id];
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = ing.label;
    chip.style.background = hex(ing.color);
    chip.style.color = chipTextColor(ing.color);
    steps.append(chip);
  });
  return steps;
}

/** All drinks with their recipes (static). Used inline in the side panel and in the 📋 modal on phones. */
export function buildMenu(): HTMLElement {
  const menu = Object.assign(document.createElement("div"), { className: "menu" });
  for (const drink of DRINKS) {
    const item = Object.assign(document.createElement("div"), { className: "menu-item" });
    const title = Object.assign(document.createElement("div"), { className: "title" });
    title.append(
      Object.assign(document.createElement("span"), { textContent: drink.name }),
      Object.assign(document.createElement("span"), { className: "price", textContent: `$${drink.price}` }),
    );
    item.append(title, recipeSteps(drink));
    menu.append(item);
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
      .map((id) => getDrink(id))
      .filter((d): d is DrinkDef => !!d);
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
        bar.className = ratio > 0.5 ? "ok" : ratio > 0.25 ? "warn" : "danger";
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
