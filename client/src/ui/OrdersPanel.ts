import { Callbacks, type Room } from "@colyseus/sdk";
import {
  CONTAINERS,
  CustomerKind,
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
  type IngredientId,
  type MenuItem,
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

const span = (className: string, text = "") => Object.assign(document.createElement("span"), { className, textContent: text });
const CONTAINER_ICONS = { plate: "🍽️", bowl: "🥣", glass: "🥤" } as const;

/**
 * Tea shop: ingredients in order (→).
 * Restaurant: what to serve it in, then one line per part: its ingredient (picture) ➜ each cooker it goes through
 * (hot ones, which burn food, outlined in red). Readable at a glance; "?" opens the full guide.
 */
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
  const parts = document.createElement("div");
  parts.className = "parts";
  parts.append(span("part-into", `${CONTAINER_ICONS[dish.container]} Cầm ${CONTAINERS[dish.container].label.toLowerCase()} đi gom:`));
  for (const part of dish.parts) {
    const parsed = parseFood(part);
    if (!parsed) continue;
    const food = FOODS[parsed.food];
    const row = span("part");
    const img = Object.assign(document.createElement("img"), { className: "part-img", alt: "", draggable: false });
    img.src = `${import.meta.env.BASE_URL}${food.image}`;
    row.append(img, span("part-name", food.label));
    if (!parsed.steps.length) row.append(span("part-raw", "để nguyên"));
    for (const step of parsed.steps) {
      const p = PROCESSES[step];
      row.append(span("part-arrow", "➜"), span(`part-step${p.burns ? " hot" : ""}`, `${p.icon} ${p.station}`));
    }
    parts.append(row);
  }
  return parts;
}

/**
 * Live customer orders (synced from room state), each with a short recipe, a "?" for the full cooking guide
 * (`onHelp(menu id)`) and a countdown bar.
 */
export class OrdersPanel {
  private ordersList: HTMLElement;
  private emptyHint: HTMLElement;
  private cards = new Map<string, { card: HTMLElement; bar: HTMLElement }>();
  private unsubscribers: (() => void)[] = [];

  constructor(
    root: HTMLElement,
    room: Room<BobaShopState>,
    private readonly onHelp: (id: string) => void,
  ) {
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
      // Restaurant dishes: a small picture so the order reads at a glance.
      const dish = getDish(drink.id);
      const name = Object.assign(document.createElement("span"), { className: "name" });
      if (dish) {
        const img = Object.assign(document.createElement("img"), { className: "thumb", alt: "", draggable: false });
        img.src = `${import.meta.env.BASE_URL}${dish.image}`;
        name.append(img);
      }
      name.append(drink.name);
      const help = Object.assign(document.createElement("button"), {
        type: "button",
        className: "help-btn",
        textContent: "?",
        title: `Cách làm ${drink.name}`,
      });
      help.addEventListener("click", () => {
        help.blur(); // keep Space for the game
        this.onHelp(drink.id);
      });
      const right = Object.assign(document.createElement("span"), { className: "title-right" });
      right.append(Object.assign(document.createElement("span"), { className: "price", textContent: `$${price}` }), help);
      title.append(name, right);
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
