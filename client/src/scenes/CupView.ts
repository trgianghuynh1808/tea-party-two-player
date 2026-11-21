import Phaser from "phaser";
import {
  BURNT,
  DISHES,
  EMPTY_HAND,
  FOODS,
  PROCESSES,
  containerOf,
  containerParts,
  cupContents,
  foodKey,
  isCup,
  isFoodId,
  isKitchenItem,
  matchDish,
  matchDrink,
  parseFood,
  type ContainerId,
  type ProcessId,
} from "@boba/shared";

/**
 * Cup artwork (client/public/assets/): one base cup per liquid, plus a topping drawn on top.
 * cups/* are built by client/assets-src/tools/build_cups.py from the sliced item sheet.
 */
const CUP_TEXTURES = {
  empty: "assets/cups/empty.png",
  black_tea: "assets/cups/black_tea.png",
  green_tea: "assets/cups/green_tea.png",
  milk_tea: "assets/cups/milk_tea.png",
  // Finished drinks with their own art (straw included).
  milk_tea_pearl: "assets/items/drinks/milk_tea_pearl.png",
  green_milk_tea: "assets/items/drinks/green_milk_tea.png",
  // Toppings
  cheese_foam: "assets/items/icons/whipped_cream.png",
  passion: "assets/items/icons/passion_seeds.png",
} as const;
type CupTexture = keyof typeof CUP_TEXTURES;

const textureKey = (name: CupTexture) => `cup-${name}`;
/** Height of the plain cup art (the drinks with a straw are taller and stick out above). */
const CUP_ART_HEIGHT = 108;
const CUP_ART_WIDTH = 87;

// ---------------------------------------------------------------- Restaurant items (food, plates, dishes)

/** Ingredient / finished dish artwork (client/public/assets/food/, cut by client/assets-src/tools/cut_food.py).
 *  Steps pick the cooked artwork (see foodImage): "food-rice" raw, "food-rice-boil" boiled. */
export const foodTextureKey = (id: string, steps: ProcessId[] = []): string => {
  const cooked = isFoodId(id) ? FOODS[id].cooked : undefined;
  for (let i = steps.length - 1; i >= 0; i--) if (cooked?.[steps[i]]) return `food-${id}-${steps[i]}`;
  return `food-${id}`;
};
export const dishTextureKey = (id: string) => `dish-${id}`;
const containerTextureKey = (id: ContainerId) => `container-${id}`;
const BURNT_KEY = "food-burnt";

export function preloadCupTextures(scene: Phaser.Scene) {
  for (const [name, url] of Object.entries(CUP_TEXTURES)) scene.load.image(textureKey(name as CupTexture), url);
  for (const [id, def] of Object.entries(FOODS)) {
    scene.load.image(foodTextureKey(id), def.image);
    const cooked = def.cooked;
    if (cooked)
      for (const step of Object.keys(cooked) as ProcessId[]) {
        const image = cooked[step];
        if (image) scene.load.image(foodTextureKey(id, [step]), image);
      }
  }
  for (const dish of DISHES) scene.load.image(dishTextureKey(dish.id), dish.image);
}

/** Empty plate / bowl / glass and burnt food, drawn with code (once per game). */
function makeKitchenTextures(scene: Phaser.Scene) {
  if (scene.textures.exists(BURNT_KEY)) return;
  const g = scene.make.graphics({}, false);
  // Plate: seen slightly from above, white with a blue rim line.
  g.fillStyle(0x3d2c29, 0.25).fillEllipse(33, 15, 64, 22);
  g.fillStyle(0xffffff).fillEllipse(32, 12, 62, 22).lineStyle(2, 0xb8c4cf).strokeEllipse(32, 12, 62, 22);
  g.lineStyle(1.5, 0x8ab6d6).strokeEllipse(32, 12, 40, 13);
  g.generateTexture(containerTextureKey("plate"), 66, 26);
  g.clear();
  // Bowl: white bowl from the side.
  g.fillStyle(0xffffff).lineStyle(2, 0xb8c4cf);
  g.beginPath().arc(28, 8, 26, 0, Math.PI, false).closePath().fillPath().strokePath();
  g.fillStyle(0xe8eef3).fillEllipse(28, 8, 52, 10).lineStyle(2, 0xb8c4cf).strokeEllipse(28, 8, 52, 10);
  g.fillStyle(0x8ab6d6).fillRect(8, 18, 40, 3);
  g.fillStyle(0xd9e2ea).fillRect(18, 33, 20, 4);
  g.generateTexture(containerTextureKey("bowl"), 56, 38);
  g.clear();
  // Glass: clear tumbler.
  g.fillStyle(0xdff3fb, 0.85).lineStyle(2, 0x8fb8c9);
  g.beginPath().moveTo(3, 2).lineTo(27, 2).lineTo(24, 42).lineTo(6, 42).closePath().fillPath().strokePath();
  g.fillStyle(0xffffff, 0.8).fillRect(8, 6, 3, 30);
  g.generateTexture(containerTextureKey("glass"), 30, 44);
  g.clear();
  // Burnt food: a charred lump.
  g.fillStyle(0x2b2522).fillEllipse(24, 22, 44, 26);
  g.fillStyle(0x3f3530).fillEllipse(18, 18, 20, 12).fillEllipse(32, 24, 16, 10);
  g.fillStyle(0x15110f).fillCircle(12, 26, 3).fillCircle(36, 16, 2).fillCircle(26, 30, 2);
  g.generateTexture(BURNT_KEY, 48, 36);
  g.destroy();
}

/** Which art shows a cup item: base cup + optional topping. */
function cupLook(item: string): { base: CupTexture; topping?: CupTexture } | undefined {
  if (!isCup(item)) return undefined;
  const contents = cupContents(item);
  const drink = matchDrink(contents);
  if (drink?.id === "milk_tea_pearl" || drink?.id === "green_milk_tea") return { base: drink.id };

  const has = (id: string) => contents.includes(id as never);
  const base: CupTexture = has("black_tea") ? (has("milk") ? "milk_tea" : "black_tea") : has("green_tea") ? "green_tea" : "empty";
  const topping: CupTexture | undefined = has("cheese_foam") ? "cheese_foam" : has("passion") ? "passion" : undefined;
  return { base, topping };
}

/** Most parts drawn on top of an unfinished plate / bowl / glass. */
const MAX_PARTS_SHOWN = 4;

/**
 * Anything a player can carry, anchored at the bottom centre: a tea shop cup (base cup + topping) or a
 * restaurant item (ingredient with a badge of its last cooking step, a container with its parts, a finished dish).
 * Hidden when the item is empty-handed.
 */
export class CupView extends Phaser.GameObjects.Container {
  private readonly base: Phaser.GameObjects.Image;
  private readonly topping: Phaser.GameObjects.Image;
  private readonly cupScale: number;
  private readonly size: number;
  /** Restaurant: the main picture (ingredient, container or dish), parts on an unfinished container, step badge. */
  private readonly food: Phaser.GameObjects.Image;
  private readonly parts: Phaser.GameObjects.Image[] = [];
  private readonly badge: Phaser.GameObjects.Text;

  /** `height` is the on-screen height of the cup body in pixels (restaurant items are drawn about as big). */
  constructor(scene: Phaser.Scene, x: number, y: number, height: number) {
    super(scene, x, y);
    makeKitchenTextures(scene);
    this.size = height;
    this.cupScale = height / CUP_ART_HEIGHT;
    this.base = scene.add.image(0, 0, textureKey("empty")).setOrigin(0.5, 1).setScale(this.cupScale);
    // Topping sits on the rim, about as wide as the cup.
    this.topping = scene.add.image(0, -height * 0.86, textureKey("cheese_foam")).setOrigin(0.5, 1).setVisible(false);
    this.food = scene.add.image(0, 0, BURNT_KEY).setOrigin(0.5, 1).setVisible(false);
    for (let i = 0; i < MAX_PARTS_SHOWN; i++) this.parts.push(scene.add.image(0, 0, BURNT_KEY).setOrigin(0.5, 1).setVisible(false));
    this.badge = scene.add
      .text(0, 0, "", { fontFamily: "sans-serif", fontSize: `${Math.max(10, Math.round(height * 0.5))}px` })
      .setOrigin(0.5)
      .setVisible(false);
    this.add([this.base, this.topping, this.food, ...this.parts, this.badge]);
    this.setVisible(false);
    scene.add.existing(this);
  }

  setItem(item: string) {
    const kitchen = item !== EMPTY_HAND && isKitchenItem(item);
    this.base.setVisible(!kitchen);
    this.food.setVisible(kitchen);
    if (!kitchen) {
      for (const p of this.parts) p.setVisible(false);
      this.badge.setVisible(false);
    } else {
      this.setVisible(this.showKitchenItem(item));
      return;
    }
    const look = item === EMPTY_HAND ? undefined : cupLook(item);
    this.setVisible(!!look);
    if (!look) return;
    this.base.setTexture(textureKey(look.base));
    this.topping.setVisible(!!look.topping);
    if (look.topping) {
      this.topping.setTexture(textureKey(look.topping));
      this.topping.setScale((CUP_ART_WIDTH * this.cupScale * 0.9) / this.topping.width);
    }
  }

  /** Scale an image to fit a `w` × `h` box (keeping its shape). */
  private fit(img: Phaser.GameObjects.Image, w: number, h: number) {
    img.setScale(Math.min(w / img.width, h / img.height));
  }

  private showKitchenItem(item: string): boolean {
    const h = this.size;
    this.topping.setVisible(false);
    for (const p of this.parts) p.setVisible(false);
    this.badge.setVisible(false);

    const key = foodKey(item);
    if (key !== undefined) {
      // An ingredient: its picture, plus the icon of its last cooking step.
      if (key === BURNT) {
        this.food.setTexture(BURNT_KEY);
        this.fit(this.food, h * 1.3, h);
        this.badge.setText("💨").setPosition(h * 0.45, -h * 0.9).setVisible(true);
        return true;
      }
      const parsed = parseFood(key);
      if (!parsed || !this.scene.textures.exists(foodTextureKey(parsed.food, parsed.steps))) return false;
      this.food.setTexture(foodTextureKey(parsed.food, parsed.steps));
      this.fit(this.food, h * 1.2, h * 1.2);
      const last = parsed.steps[parsed.steps.length - 1];
      if (last) this.badge.setText(PROCESSES[last].icon).setPosition(h * 0.5, -h * 1.05).setVisible(true);
      return true;
    }

    const container = containerOf(item);
    if (!container) return false;
    // A finished dish: its own artwork.
    const dish = matchDish(item);
    if (dish && this.scene.textures.exists(dishTextureKey(dish.id))) {
      this.food.setTexture(dishTextureKey(dish.id));
      if (container === "glass") this.fit(this.food, h * 1.1, h * 1.3);
      else this.fit(this.food, h * 1.7, h * 1.4);
      return true;
    }
    // Unfinished: the container with small pictures of what's in it.
    this.food.setTexture(containerTextureKey(container));
    if (container === "glass") this.fit(this.food, h, h * 1.1);
    else this.fit(this.food, h * 1.6, h * 1.1);
    const parts = containerParts(item).slice(0, MAX_PARTS_SHOWN);
    const step = h * 0.55;
    const baseY = container === "glass" ? -h * 0.75 : container === "bowl" ? -h * 0.35 : -h * 0.15;
    parts.forEach((part, i) => {
      const parsed = parseFood(part);
      const img = this.parts[i];
      if (!parsed || !this.scene.textures.exists(foodTextureKey(parsed.food, parsed.steps))) return;
      img.setTexture(foodTextureKey(parsed.food, parsed.steps)).setVisible(true);
      this.fit(img, h * 0.7, h * 0.7);
      img.setPosition((i - (parts.length - 1) / 2) * step, baseY - (i % 2) * h * 0.12);
    });
    return true;
  }
}
