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
    header(dish.name, dish.price, image(dish.image, "guide-dish"), many ? `${c.label} · ${dish.parts.length} phần, làm phần nào trước cũng được` : c.label),
  );

  // Hands hold one thing: cook a part first, take it to the shelf (it's served onto a new container there),
  // put that container down on a counter, then bring the other parts to it.
  const steps = el("ol", "guide-steps");
  let n = 1;
  let burns = false;
  dish.parts.forEach((part, i) => {
    const parsed = parseFood(part);
    if (!parsed) return;
    const food = FOODS[parsed.food];
    const boxes = [box(image(food.image, "guide-food"), `Thùng ${food.label}`)];
    for (const step of parsed.steps) {
      const p = PROCESSES[step];
      burns ||= p.burns;
      boxes.push(box(p.icon, `${p.station} ${p.seconds}s`, p.burns ? "hot" : ""));
    }
    boxes.push(i === 0 ? box(icon, `Cầm tới ${c.shelf}: bày ra ${cl}`, "into") : box(icon, `Bấm vào ${cl} trên Bàn`, "into"));
    steps.append(stepRow(n++, ...boxes));
    if (i === 0 && many) steps.append(stepRow(n++, box("🪑", `Đặt ${cl} lên Bàn cho rảnh tay`)));
  });
  steps.append(stepRow(n, box("🛎️", `${many ? `Nhặt ${cl} lên, mang` : "Mang"} ra bàn khách / quầy Mang đi`)));
  root.append(steps);

  const tips = el("ul", "guide-tips");
  tips.append(
    el("li", "", "✋ Tay chỉ cầm được 1 thứ: nấu xong phần nào thì bày phần đó ra, chưa cần lấy đồ đựng trước."),
    el(
      "li",
      "",
      `💡 Cách khác: đang cầm ${cl} mà bấm vào bếp / thớt có món đã xong, hoặc thùng nguyên liệu dùng nguyên (Sữa, Bánh mì) là cho thẳng vào.`,
    ),
  );
  if (burns) tips.append(el("li", "", `🔥 Ô viền đỏ là bếp nóng: nấu xong để quá ${BURN_SECONDS} giây sẽ cháy.`));
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
