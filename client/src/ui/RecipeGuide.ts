import {
  BURN_SECONDS,
  CONTAINERS,
  FOODS,
  INGREDIENTS,
  PROCESSES,
  STATIONS,
  StationType,
  getDish,
  getDrink,
  parseFood,
  type ContainerId,
  type DishDef,
  type DrinkDef,
} from "@boba/shared";

// Step-by-step cooking guide of one menu item, opened with the "?" on an order card.

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = "") =>
  Object.assign(document.createElement(tag), { className, textContent: text });

const CONTAINER_ICONS: Record<ContainerId, string> = { plate: "🍽️", bowl: "🥣", glass: "🥤" };

function image(url: string, className: string): HTMLImageElement {
  const img = el("img", className);
  img.src = `${import.meta.env.BASE_URL}${url}`;
  img.alt = "";
  img.draggable = false;
  return img;
}

/** One box of a step row: a picture / big icon over a short caption. */
function box(visual: HTMLElement | string, caption: string, className = ""): HTMLElement {
  const b = el("div", `guide-box ${className}`);
  b.append(typeof visual === "string" ? el("span", "guide-icon", visual) : visual, el("span", "guide-caption", caption));
  return b;
}

const arrow = () => el("span", "guide-arrow", "➜");

function stepRow(n: number, ...boxes: HTMLElement[]): HTMLElement {
  const row = el("li", "guide-step");
  const flow = el("div", "guide-flow");
  boxes.forEach((b, i) => {
    if (i > 0) flow.append(arrow());
    flow.append(b);
  });
  row.append(el("span", "guide-num", String(n)), flow);
  return row;
}

function header(title: string, price: number, picture: HTMLElement | undefined, sub: string): HTMLElement {
  const head = el("div", "guide-head");
  if (picture) head.append(picture);
  const text = el("div", "guide-title");
  text.append(el("strong", "", title), el("span", "guide-price", `$${price}`), el("span", "guide-sub", sub));
  head.append(text);
  return head;
}

function dishGuide(dish: DishDef): HTMLElement {
  const root = el("div", "guide");
  const c = CONTAINERS[dish.container];
  const cl = c.label.toLowerCase();
  const icon = CONTAINER_ICONS[dish.container];
  const many = dish.parts.length > 1;
  root.append(
    header(dish.name, dish.price, image(dish.image, "guide-dish"), many ? `${c.label} · ${dish.parts.length} phần, gom phần nào trước cũng được` : c.label),
  );

  // Cook each part and leave it where it is; then take the container around and scoop every part into it.
  const steps = el("ol", "guide-steps");
  let n = 1;
  let burns = false;
  const gather = [box(icon, `Lấy ${cl} ở ${c.shelf}`)];
  for (const part of dish.parts) {
    const parsed = parseFood(part);
    if (!parsed) continue;
    const food = FOODS[parsed.food];
    const last = parsed.steps[parsed.steps.length - 1];
    if (last) {
      const boxes = [box(image(food.image, "guide-food"), `Thùng ${food.label}`)];
      for (const step of parsed.steps) {
        const p = PROCESSES[step];
        burns ||= p.burns;
        boxes.push(box(p.icon, `${p.station} ${p.seconds}s`, p.burns ? "hot" : ""));
      }
      boxes.push(box("⏳", "Để đó chờ lấy"));
      steps.append(stepRow(n++, ...boxes));
    }
    // Raw parts are scooped straight from their crate.
    gather.push(box(image(food.image, "guide-food"), last ? `Bấm vào ${PROCESSES[last].station}` : `Bấm vào thùng ${food.label}`, "into"));
  }
  steps.append(stepRow(n++, ...gather), stepRow(n, box("🛎️", "Mang ra bàn khách / quầy Mang đi")));
  root.append(steps);

  const tips = el("ul", "guide-tips");
  tips.append(
    el("li", "", `✋ Món không mang tới ${cl} được: cầm ${cl} tới chỗ có món (bếp, thớt, Bàn, thùng nguyên liệu) rồi bấm để lấy.`),
    el("li", "", `🪑 Chưa kịp lấy thì nhặt món ra đặt lên Bàn, lát cầm ${cl} tới lấy. Đang cầm ${cl} mà cần rảnh tay thì đặt ${cl} lên Bàn.`),
  );
  if (burns) tips.append(el("li", "", `🔥 Ô viền đỏ là bếp nóng: nấu xong mà ${BURN_SECONDS} giây chưa lấy sẽ cháy.`));
  tips.append(el("li", "", "🗑 Bỏ nhầm thì đổ vào thùng rác: đồ ăn mất, đĩa / tô / ly được giữ lại."));
  root.append(tips);
  return root;
}

function drinkGuide(drink: DrinkDef): HTMLElement {
  const root = el("div", "guide");
  root.append(header(drink.name, drink.price, undefined, "Ly · thêm theo đúng thứ tự"));
  const steps = el("ol", "guide-steps");
  steps.append(stepRow(1, box("🥤", "Lấy ly ở Kệ ly")));
  const machines = drink.steps.map((id) => {
    const station = STATIONS.find((s) => s.type === StationType.Machine && s.ingredient === id);
    const wait = station?.processSeconds ? ` ${station.processSeconds}s` : "";
    return box("🧋", `${INGREDIENTS[id].label}${wait}`);
  });
  steps.append(stepRow(2, ...machines), stepRow(3, box("🛎️", "Mang ra bàn khách / quầy Giao hàng")));
  root.append(steps);
  const tips = el("ul", "guide-tips");
  tips.append(el("li", "", "💡 Máy có ⏱ thì đặt ly lên, chờ xong rồi lấy ra; để lâu sẽ bị tràn."));
  root.append(tips);
  return root;
}

/** Guide of a drink or dish by menu id (undefined if the id is unknown). */
export function buildRecipeGuide(id: string): HTMLElement | undefined {
  const dish = getDish(id);
  if (dish) return dishGuide(dish);
  const drink = getDrink(id);
  return drink ? drinkGuide(drink) : undefined;
}
