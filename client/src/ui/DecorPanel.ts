import { Callbacks, type Room } from "@colyseus/sdk";
import { DECORATION_CATALOG, DECORATION_CATEGORIES, DECORATION_REFUND_RATE, rotationCount, type DecorationDef } from "@boba/shared";
import type { BobaShopState } from "@boba/shared/schema";
import { addRotateBadge, makeRotateButton } from "./rotateUi";

/** game.events event: the player started dragging a catalog item out of the panel. */
export const PALETTE_DRAG_START = "palette-drag-start";
/** game.events event: turn the piece being placed / the selected piece (⟳ button). */
export const DECOR_ROTATE = "decor-rotate";
export interface PaletteDragStart {
  kind: string;
  pointerId: number;
  clientX: number;
  clientY: number;
}

const hex = (color: number) => "#" + color.toString(16).padStart(6, "0");

/** Which catalog groups are expanded, remembered between visits (first group open by default). */
const OPEN_SECTIONS_KEY = "decor-open-sections";

function loadOpenSections(): Set<string> {
  try {
    const saved = JSON.parse(localStorage.getItem(OPEN_SECTIONS_KEY) ?? "null");
    if (Array.isArray(saved)) return new Set(saved.filter((v): v is string => typeof v === "string"));
  } catch {
    // Corrupt value or storage unavailable: fall back to the default.
  }
  return new Set([DECORATION_CATEGORIES[0].id]);
}

function saveOpenSections(open: Set<string>) {
  try {
    localStorage.setItem(OPEN_SECTIONS_KEY, JSON.stringify([...open]));
  } catch {
    // Private mode / storage full: the state just isn't remembered.
  }
}

/**
 * Furniture catalog shown in the side panel while decorating.
 * Press on an item and drag it into the shop to buy & place it (handled by ShopScene).
 */
export class DecorPanel {
  private items: { el: HTMLElement; price: number }[] = [];
  private moneyLabel: HTMLElement;
  private unsubscribers: (() => void)[] = [];

  constructor(
    root: HTMLElement,
    room: Room<BobaShopState>,
    onDragStart: (event: PaletteDragStart) => void,
    onRotate: () => void,
  ) {
    root.replaceChildren();
    const title = document.createElement("h2");
    title.textContent = "🪑 Trang trí";
    this.moneyLabel = document.createElement("p");
    this.moneyLabel.className = "decor-money";
    const help = document.createElement("p");
    help.className = "hint";
    help.textContent =
      `Kéo đồ vào quán để mua. Kéo đồ trong quán để di chuyển, kéo vào 🗑 để bán lại ${DECORATION_REFUND_RATE * 100}%. ` +
      "Bấm R (hoặc ⟳) để xoay món đang kéo / vừa chọn; món có ⟳ xoay được. " +
      "Khách chỉ ngồi ghế/đôn đặt sát Bàn khách (để được mang nước ra bàn). " +
      "Điện thoại, iPad đặt lên mặt bàn, kệ TV, bàn trang điểm.";

    const rotateBtn = makeRotateButton(onRotate);

    const list = document.createElement("div");
    list.className = "decor-list";
    // One collapsible group per category; items without a category go to a last "Khác" group.
    const open = loadOpenSections();
    const groups = [...DECORATION_CATEGORIES, { id: "other", title: "Khác" }];
    for (const group of groups) {
      const defs = DECORATION_CATALOG.filter((d) => (d.category ?? "other") === group.id);
      if (defs.length === 0) continue;
      const section = document.createElement("details");
      section.className = "decor-section";
      section.open = open.has(group.id);
      const summary = document.createElement("summary");
      const name = document.createElement("span");
      name.textContent = group.title;
      const count = document.createElement("span");
      count.className = "decor-section-count";
      count.textContent = String(defs.length);
      summary.append(name, count);
      const items = document.createElement("div");
      items.className = "decor-section-items";
      for (const def of defs) this.addItem(items, def, onDragStart);
      section.append(summary, items);
      section.addEventListener("toggle", () => {
        if (section.open) open.add(group.id);
        else open.delete(group.id);
        saveOpenSections(open);
      });
      list.append(section);
    }

    root.append(title, this.moneyLabel, help, rotateBtn, list);

    const $ = Callbacks.get(room);
    // Only the host can open this panel: furniture is bought from their own wallet.
    this.unsubscribers.push(
      $.onAdd("players", (player, sessionId) => {
        if (sessionId === room.sessionId) this.unsubscribers.push($.listen(player, "money", (money) => this.updateMoney(money)));
      }),
    );
  }

  destroy() {
    this.unsubscribers.forEach((off) => off());
  }

  private addItem(list: HTMLElement, def: DecorationDef, onDragStart: (event: PaletteDragStart) => void) {
    const el = document.createElement("div");
    el.className = "decor-item";
    el.title = `Kéo vào quán để mua ${def.label}`;
    let swatch: HTMLElement;
    if (def.image) {
      const img = document.createElement("img");
      img.className = "swatch-img";
      img.src = `${import.meta.env.BASE_URL}${def.image}`;
      img.alt = "";
      img.draggable = false;
      swatch = img;
    } else {
      swatch = document.createElement("span");
      swatch.className = `swatch ${def.shape}`;
      swatch.style.background = hex(def.color);
    }
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = def.label;
    const price = document.createElement("strong");
    price.textContent = `$${def.price}`;
    el.append(swatch, name, price);
    addRotateBadge(el, rotationCount(def) > 1);

    el.addEventListener("pointerdown", (e) => {
      if (el.classList.contains("disabled")) return;
      e.preventDefault(); // no text selection / native image drag
      onDragStart({ kind: def.kind, pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY });
    });
    list.append(el);
    this.items.push({ el, price: def.price });
  }

  private updateMoney(money: number) {
    this.moneyLabel.textContent = `💰 Ví của bạn có $${money}`;
    for (const { el, price } of this.items) el.classList.toggle("disabled", money < price);
  }
}
