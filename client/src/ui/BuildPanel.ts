import { Callbacks, type Room } from "@colyseus/sdk";
import { BUILD_REFUND_RATE, BUILD_TILES, DECORATION_CATEGORIES, ERASE_TOOL, buildRotationCount, type BuildTileDef } from "@boba/shared";
import { propThumbnail } from "../scenes/YardView";
import { isTouchDevice } from "../input/TouchControls";
import { addRotateBadge, makeRotateButton } from "./rotateUi";
import { decorImageUrl } from "../customCatalog";
import type { BobaShopState } from "@boba/shared/schema";

/** game.events event: turn the prop being placed / the selected prop (⟳ button, build mode). */
export const BUILD_ROTATE = "build-rotate";

const hex = (color: number) => "#" + color.toString(16).padStart(6, "0");

const GROUPS: { title: string; has: (def: BuildTileDef) => boolean }[] = [
  { title: "🟫 Sàn (kéo để lát kín vùng)", has: (d) => d.shape === "floor" },
  { title: "🧱 Tường & rào (kéo để vẽ khung)", has: (d) => d.shape === "wall" || d.shape === "fence" },
  { title: "🚪 Cửa (đặt lên 1 ô)", has: (d) => d.shape === "door" },
  { title: "🌳 Cây cối (bấm vào 1 ô)", has: (d) => d.group === "tree" },
  { title: "🪵 Đồ ngoài trời (bấm vào 1 ô)", has: (d) => d.group === "outdoor" },
  // Furniture shared with the decorate catalog, in its groups (rugs / wall art have no yard version).
  ...DECORATION_CATEGORIES.map((c) => ({
    title: `${c.title} (nội thất, bấm vào 1 ô)`,
    has: (d: BuildTileDef) => d.group === "decor" && d.category === c.id,
  })),
];

/**
 * Build mode side panel: pick a material (or the eraser), then drag over the yard (BuildController).
 * No tool is picked to start with; pressing the selected tool again unpicks it, so the host can select /
 * move / rotate / sell placed props instead (same gestures as decorate mode).
 */
export class BuildPanel {
  private buttons = new Map<string, HTMLElement>();
  private selected = "";
  private moneyLabel: HTMLElement;
  private unsubscribers: (() => void)[] = [];

  constructor(
    root: HTMLElement,
    room: Room<BobaShopState>,
    private readonly onTool: (tool: string) => void,
    onRotate: () => void,
  ) {
    root.replaceChildren();
    const title = Object.assign(document.createElement("h2"), { textContent: "🔨 Xây nhà" });
    this.moneyLabel = Object.assign(document.createElement("p"), { className: "decor-money" });
    const help = Object.assign(document.createElement("p"), {
      className: "hint",
      textContent:
        "Chọn vật liệu rồi kéo trên đất trống. Không chọn vật liệu nào thì bấm vật đã đặt để chọn, kéo để di chuyển, R/⟳ để xoay, kéo vào 🗑 hoặc Delete để bán. " +
        "Tường đứng trên sàn: lát sàn phủ cả các ô tường để sàn liền tới chân tường. " +
        "Tường chặn đường đi, nhớ đặt một ô Cửa để vào nhà. " +
        `Xây đè hoặc dùng Tẩy được hoàn ${BUILD_REFUND_RATE * 100}% tiền ô cũ. ` +
        (isTouchDevice()
          ? "Bấm nút 🚶 Đi lại trên màn hình để dùng joystick đi quanh sân, bấm 🔨 Xây tiếp để xây."
          : "Vẫn đi lại bằng WASD khi đang xây."),
    });
    const rotateBtn = makeRotateButton(onRotate);
    const list = Object.assign(document.createElement("div"), { className: "decor-list" });

    for (const group of GROUPS) {
      const defs = BUILD_TILES.filter(group.has);
      if (!defs.length) continue;
      list.append(Object.assign(document.createElement("h3"), { className: "build-group", textContent: group.title }));
      for (const def of defs) {
        const price = def.shape === "prop" ? `$${def.price}` : `$${def.price}/ô`;
        const btn = this.makeButton(def.kind, def.label, price, hex(def.color), hex(def.accent), propThumbnail(def), !def.decor);
        btn.title = "Đặt lên một ô trống";
        addRotateBadge(btn, buildRotationCount(def) > 1);
        list.append(btn);
      }
    }
    const eraseTitle = Object.assign(document.createElement("h3"), { className: "build-group", textContent: "🧽 Dỡ bỏ" });
    const eraseBtn = this.makeButton(ERASE_TOOL, "Tẩy (kéo để dỡ)", "", "#ffffff", "#e63946");
    list.append(eraseTitle, eraseBtn);
    // Guests build on the host's land with their own money, on empty cells only (no replacing, no eraser).
    const guestNote = Object.assign(document.createElement("p"), {
      className: "hint",
      hidden: true,
      textContent: `Bạn đang xây giúp ${room.state.hostName || "chủ phòng"}: tiền trừ vào ví của bạn, chỉ xây được trên ô trống (không xây đè, không dỡ).`,
    });

    root.append(title, this.moneyLabel, guestNote, help, rotateBtn, list);

    const $ = Callbacks.get(room);
    this.unsubscribers.push(
      $.onAdd("players", (player, sessionId) => {
        if (sessionId !== room.sessionId) return;
        this.unsubscribers.push($.listen(player, "money", (money) => (this.moneyLabel.textContent = `💰 Ví của bạn có $${money}`)));
        this.unsubscribers.push(
          $.listen(player, "host", (host) => {
            guestNote.hidden = host;
            eraseTitle.hidden = eraseBtn.hidden = !host;
            if (!host && this.selected === ERASE_TOOL) this.select("");
          }),
        );
      }),
    );
  }

  destroy() {
    this.unsubscribers.forEach((off) => off());
  }

  private makeButton(tool: string, label: string, price: string, color: string, accent: string, image?: string, pixelArt = true): HTMLElement {
    const el = Object.assign(document.createElement("button"), { type: "button", className: "decor-item build-item" });
    let swatch: HTMLElement;
    if (image) {
      swatch = Object.assign(document.createElement("img"), { className: pixelArt ? "swatch-img pixel" : "swatch-img", src: decorImageUrl(image), alt: "" });
    } else {
      swatch = Object.assign(document.createElement("span"), { className: "swatch" });
      swatch.style.background = `linear-gradient(135deg, ${color} 60%, ${accent} 60%)`;
    }
    const name = Object.assign(document.createElement("span"), { className: "name", textContent: label });
    const cost = Object.assign(document.createElement("strong"), { textContent: price });
    el.append(swatch, name, cost);
    el.addEventListener("click", () => {
      // Pressing the selected tool again unpicks it ("" = work on placed props instead).
      this.select(this.selected === tool ? "" : tool);
      el.blur(); // keep Space / WASD for the game
    });
    this.buttons.set(tool, el);
    return el;
  }

  private select(tool: string) {
    this.selected = tool;
    for (const [t, el] of this.buttons) el.classList.toggle("selected", t === tool);
    this.onTool(tool);
  }
}
