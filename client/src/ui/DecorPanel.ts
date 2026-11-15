import { Callbacks, type Room } from "@colyseus/sdk";
import { DECORATION_CATALOG, DECORATION_REFUND_RATE } from "@boba/shared";
import type { BobaShopState } from "@boba/shared/schema";

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
      "Bấm R (hoặc ⟳) để xoay món đang kéo / vừa chọn.";

    const rotateBtn = document.createElement("button");
    rotateBtn.type = "button";
    rotateBtn.className = "btn rotate-btn";
    rotateBtn.textContent = "⟳ Xoay (R)";
    // pointerdown + preventDefault: works while another finger drags, and doesn't steal focus from the game.
    rotateBtn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      onRotate();
    });

    const list = document.createElement("div");
    list.className = "decor-list";
    for (const def of DECORATION_CATALOG) {
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

      el.addEventListener("pointerdown", (e) => {
        if (el.classList.contains("disabled")) return;
        e.preventDefault(); // no text selection / native image drag
        onDragStart({ kind: def.kind, pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY });
      });
      list.append(el);
      this.items.push({ el, price: def.price });
    }

    root.append(title, this.moneyLabel, help, rotateBtn, list);

    const $ = Callbacks.get(room);
    this.unsubscribers.push($.listen("money", (money) => this.updateMoney(money)));
  }

  destroy() {
    this.unsubscribers.forEach((off) => off());
  }

  private updateMoney(money: number) {
    this.moneyLabel.textContent = `💰 Quán đang có $${money}`;
    for (const { el, price } of this.items) el.classList.toggle("disabled", money < price);
  }
}
