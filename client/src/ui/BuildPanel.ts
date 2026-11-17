import { Callbacks, type Room } from "@colyseus/sdk";
import { BUILD_REFUND_RATE, BUILD_TILES, ERASE_TOOL, type BuildShape } from "@boba/shared";
import type { BobaShopState } from "@boba/shared/schema";

const hex = (color: number) => "#" + color.toString(16).padStart(6, "0");

const SHAPE_GROUPS: { title: string; shapes: BuildShape[] }[] = [
  { title: "🟫 Sàn (kéo để lát kín vùng)", shapes: ["floor"] },
  { title: "🧱 Tường & rào (kéo để vẽ khung)", shapes: ["wall", "fence"] },
  { title: "🚪 Cửa (đặt lên 1 ô)", shapes: ["door"] },
];

/** Build mode side panel: pick a material (or the eraser), then drag over the yard (BuildController). */
export class BuildPanel {
  private buttons = new Map<string, HTMLElement>();
  private moneyLabel: HTMLElement;
  private unsubscribers: (() => void)[] = [];

  constructor(
    root: HTMLElement,
    room: Room<BobaShopState>,
    private readonly onTool: (tool: string) => void,
  ) {
    root.replaceChildren();
    const title = Object.assign(document.createElement("h2"), { textContent: "🔨 Xây nhà" });
    this.moneyLabel = Object.assign(document.createElement("p"), { className: "decor-money" });
    const help = Object.assign(document.createElement("p"), {
      className: "hint",
      textContent:
        "Chọn vật liệu rồi kéo trên đất trống. Tường đứng trên sàn: lát sàn phủ cả các ô tường để sàn liền tới chân tường. " +
        "Tường chặn đường đi, nhớ đặt một ô Cửa để vào nhà. " +
        `Xây đè hoặc dùng Tẩy được hoàn ${BUILD_REFUND_RATE * 100}% tiền ô cũ. Vẫn đi lại bằng WASD khi đang xây.`,
    });
    const list = Object.assign(document.createElement("div"), { className: "decor-list" });

    for (const group of SHAPE_GROUPS) {
      list.append(Object.assign(document.createElement("h3"), { className: "build-group", textContent: group.title }));
      for (const def of BUILD_TILES.filter((t) => group.shapes.includes(t.shape))) {
        list.append(this.makeButton(def.kind, def.label, `$${def.price}/ô`, hex(def.color), hex(def.accent)));
      }
    }
    list.append(Object.assign(document.createElement("h3"), { className: "build-group", textContent: "🧽 Dỡ bỏ" }));
    list.append(this.makeButton(ERASE_TOOL, "Tẩy (kéo để dỡ)", "", "#ffffff", "#e63946"));

    root.append(title, this.moneyLabel, help, list);
    this.select("floor_wood");

    const $ = Callbacks.get(room);
    this.unsubscribers.push(
      $.onAdd("players", (player, sessionId) => {
        if (sessionId !== room.sessionId) return;
        this.unsubscribers.push($.listen(player, "money", (money) => (this.moneyLabel.textContent = `💰 Ví của bạn có $${money}`)));
      }),
    );
  }

  destroy() {
    this.unsubscribers.forEach((off) => off());
  }

  private makeButton(tool: string, label: string, price: string, color: string, accent: string): HTMLElement {
    const el = Object.assign(document.createElement("button"), { type: "button", className: "decor-item build-item" });
    const swatch = Object.assign(document.createElement("span"), { className: "swatch" });
    swatch.style.background = `linear-gradient(135deg, ${color} 60%, ${accent} 60%)`;
    const name = Object.assign(document.createElement("span"), { className: "name", textContent: label });
    const cost = Object.assign(document.createElement("strong"), { textContent: price });
    el.append(swatch, name, cost);
    el.addEventListener("click", () => {
      this.select(tool);
      el.blur(); // keep Space / WASD for the game
    });
    this.buttons.set(tool, el);
    return el;
  }

  private select(tool: string) {
    for (const [t, el] of this.buttons) el.classList.toggle("selected", t === tool);
    this.onTool(tool);
  }
}
