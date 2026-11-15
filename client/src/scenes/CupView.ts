import Phaser from "phaser";
import { EMPTY_HAND, cupContents, isCup, matchDrink } from "@boba/shared";

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

export function preloadCupTextures(scene: Phaser.Scene) {
  for (const [name, url] of Object.entries(CUP_TEXTURES)) scene.load.image(textureKey(name as CupTexture), url);
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

/** A cup drawn from artwork, anchored at the bottom centre. Hidden when the item is empty-handed. */
export class CupView extends Phaser.GameObjects.Container {
  private readonly base: Phaser.GameObjects.Image;
  private readonly topping: Phaser.GameObjects.Image;
  private readonly cupScale: number;

  /** `height` is the on-screen height of the cup body in pixels. */
  constructor(scene: Phaser.Scene, x: number, y: number, height: number) {
    super(scene, x, y);
    this.cupScale = height / CUP_ART_HEIGHT;
    this.base = scene.add.image(0, 0, textureKey("empty")).setOrigin(0.5, 1).setScale(this.cupScale);
    // Topping sits on the rim, about as wide as the cup.
    this.topping = scene.add.image(0, -height * 0.86, textureKey("cheese_foam")).setOrigin(0.5, 1).setVisible(false);
    this.add([this.base, this.topping]);
    this.setVisible(false);
    scene.add.existing(this);
  }

  setItem(item: string) {
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
}
