import Phaser from "phaser";
import { INGREDIENTS, StationType, type IngredientId, type StationDef } from "@boba/shared";
import { KITCHEN_ART_RISE } from "./KitchenArt";

// Tea shop back stations (the cup shelf + the ingredient machines), drawn with code like KitchenArt:
// a wooden counter with the station's equipment on top. The front face has no cupboard doors: its middle
// stays free for the ingredient icon (STATION_ICONS) the scene puts there.

const W = 96; // = MACHINE_W in shared/src/menu.ts
const OUTLINE = 0x3d2c29;
/** Wood tones shared by every tea counter (same family as the kitchen counters). */
const WOOD = { top: 0xdcc29c, front: 0x9c7457, edge: 0x7a5a43 };

const key = (name: string) => `tea-${name}`;

/** Texture of a tea shop station (undefined = not a tea station drawn with code). */
export function teaStationTexture(def: StationDef): string | undefined {
  if (def.type === StationType.CupShelf) return key("cup_shelf");
  if (def.type === StationType.Machine && def.ingredient) return key(def.ingredient);
  return undefined;
}

type G = Phaser.GameObjects.Graphics;

/**
 * Texture-space layout (counter top, front face, texture height). Computed lazily via layout():
 * this module and KitchenArt import each other (teaStationTexture here, KITCHEN_ART_RISE there), so
 * KITCHEN_ART_RISE must be read only once the modules are loaded, never while they initialize.
 */
interface Layout {
  top: number;
  front: number;
  h: number;
}
const layout = (): Layout => {
  const top = KITCHEN_ART_RISE;
  return { top, front: top + 20, h: 60 + top }; // station box 60 tall (MACHINE_H) + the rise above it
};

/** Wooden counter: top surface, front face, edge lip, shadow and outline (no doors: room for the icon). */
function counter(g: G, l: Layout) {
  g.fillStyle(WOOD.front).fillRect(2, l.front, W - 4, l.h - l.front - 2);
  g.fillStyle(WOOD.top).fillRoundedRect(0, l.top, W, l.front - l.top + 4, 4);
  g.fillStyle(WOOD.edge).fillRect(0, l.front, W, 3);
  g.fillStyle(0x000000, 0.15).fillRect(2, l.h - 8, W - 4, 6);
  g.lineStyle(2, OUTLINE, 0.8).strokeRoundedRect(1, l.top, W - 2, l.h - l.top - 1, 4);
}

/** A tiny plastic cup (tapered body + coloured lid), echoing the game's cup art. */
function smallCup(g: G, x: number, y: number) {
  g.fillStyle(0xfdf6ec).lineStyle(1, OUTLINE, 0.5);
  g.beginPath().moveTo(x - 5, y).lineTo(x + 5, y).lineTo(x + 4, y + 8).lineTo(x - 4, y + 8).closePath().fillPath().strokePath();
  g.fillStyle(0xe76f51).fillRoundedRect(x - 4, y - 4, 8, 5, 2);
}

/** Glass tea brewer: coloured tea inside, serving tap on the side, wooden lid on a steel base. */
function teaBrewer(g: G, l: Layout, color: number) {
  counter(g, l);
  g.fillStyle(0x4d5560).fillRoundedRect(26, 30, 44, 4, 2);
  g.fillStyle(color).fillRoundedRect(31, 10, 32, 20, 3);
  g.fillStyle(0xffffff, 0.35).fillRect(34, 12, 4, 14);
  g.fillStyle(0xdff3fb, 0.35).fillRoundedRect(29, 3, 36, 27, 4);
  g.lineStyle(1.5, 0x8fb8c9).strokeRoundedRect(29, 3, 36, 27, 4);
  g.fillStyle(0x5b4636).fillRoundedRect(26, 0, 42, 5, 2);
  g.lineStyle(1, OUTLINE, 0.5).strokeRoundedRect(26, 0, 42, 5, 2);
  g.fillStyle(0x8a929c).fillRect(63, 20, 7, 5).fillRect(68, 25, 4, 5);
  g.fillStyle(0x4d5560).fillRect(63, 20, 7, 2);
  g.fillStyle(color, 0.9).fillCircle(70, 31, 1.5);
}

const DRAW: Record<"cup_shelf" | IngredientId, (g: G, l: Layout) => void> = {
  cup_shelf(g, l) {
    counter(g, l);
    // Open rack: side boards and a middle board, cups stacked on both levels.
    g.fillStyle(0x8d6e63).fillRect(25, 6, 5, 28).fillRect(66, 6, 5, 28).fillRect(23, 17, 50, 4);
    g.lineStyle(1, OUTLINE, 0.5).strokeRect(25, 6, 5, 28).strokeRect(66, 6, 5, 28);
    smallCup(g, 40, 8);
    smallCup(g, 56, 8);
    smallCup(g, 40, 24);
    smallCup(g, 56, 24);
  },
  black_tea(g, l) {
    teaBrewer(g, l, INGREDIENTS.black_tea.color);
  },
  green_tea(g, l) {
    teaBrewer(g, l, INGREDIENTS.green_tea.color);
  },
  milk(g, l) {
    counter(g, l);
    // Stainless milk jug: steel body, milk at the rim, spout and a side handle.
    g.fillStyle(0x9aa7b4).fillRoundedRect(33, 8, 30, 26, 4);
    g.lineStyle(2, OUTLINE, 0.5).strokeRoundedRect(33, 8, 30, 26, 4);
    g.fillStyle(0xc3ccd5).fillRect(36, 11, 5, 20);
    g.fillStyle(INGREDIENTS.milk.color).fillEllipse(48, 9, 26, 6);
    g.fillStyle(0x8a929c).fillRect(30, 5, 8, 4);
    g.lineStyle(3, 0x8a929c);
    g.beginPath().arc(63, 18, 9, -Math.PI / 2, Math.PI / 2, false).strokePath();
  },
  pearl(g, l) {
    counter(g, l);
    // Small lidded pot with pearls peeking at the rim, a tray of pearls on the side.
    g.fillStyle(0x6d4c41).fillRoundedRect(22, 12, 30, 22, 3);
    g.fillStyle(0x8a5a44).fillRect(25, 15, 4, 16);
    g.lineStyle(2, OUTLINE, 0.5).strokeRoundedRect(22, 12, 30, 22, 3);
    g.fillStyle(INGREDIENTS.pearl.color).fillCircle(33, 13, 2.5).fillCircle(41, 12, 2.5).fillCircle(49, 13, 2.5);
    g.fillStyle(0x4d3327).fillRoundedRect(19, 7, 36, 6, 3);
    g.fillStyle(0x2b1b16).fillCircle(37, 6, 3);
    g.fillStyle(0xe9d8c3).fillRoundedRect(58, 26, 26, 8, 3);
    g.lineStyle(1, OUTLINE, 0.5).strokeRoundedRect(58, 26, 26, 8, 3);
    g.fillStyle(INGREDIENTS.pearl.color).fillCircle(63, 29, 2).fillCircle(69, 28, 2).fillCircle(75, 29, 2).fillCircle(80, 30, 2);
  },
  cheese_foam(g, l) {
    counter(g, l);
    // Bowl of cheese foam with a soft-serve swirl.
    g.fillStyle(0xffffff).lineStyle(1.5, 0xb8c4cf);
    g.beginPath().moveTo(29, 16).lineTo(67, 16).lineTo(61, 34).lineTo(35, 34).closePath().fillPath().strokePath();
    g.fillStyle(0xe8eef3).fillEllipse(48, 16, 38, 6);
    const cream = INGREDIENTS.cheese_foam.color;
    g.fillStyle(cream).fillEllipse(48, 13, 36, 12);
    g.fillStyle(0xfff3c4).fillEllipse(48, 9, 26, 9);
    g.fillStyle(cream).fillEllipse(48, 5, 14, 7);
    g.fillStyle(0xffffff, 0.6).fillCircle(43, 5, 2);
    g.fillStyle(cream).fillRect(38, 22, 4, 6);
  },
  passion(g, l) {
    counter(g, l);
    // Glass jar of passion fruit pulp with dark seeds under a steel lid.
    g.fillStyle(0x9aa7b4).fillRoundedRect(31, 0, 34, 7, 3);
    g.lineStyle(1, OUTLINE, 0.5).strokeRoundedRect(31, 0, 34, 7, 3);
    g.fillStyle(INGREDIENTS.passion.color, 0.92).fillRoundedRect(34, 10, 28, 24, 3);
    g.fillStyle(0x4e342e)
      .fillCircle(38, 15, 1.5)
      .fillCircle(44, 20, 1.5)
      .fillCircle(52, 14, 1.5)
      .fillCircle(49, 25, 1.5)
      .fillCircle(58, 21, 1.5)
      .fillCircle(42, 27, 1.5);
    g.fillStyle(0xdff3fb, 0.35).fillRoundedRect(32, 6, 32, 28, 4);
    g.lineStyle(1.5, 0x8fb8c9).strokeRoundedRect(32, 6, 32, 28, 4);
    g.fillStyle(0xffffff, 0.7).fillRect(35, 9, 3, 20);
  },
};

/** Draw every tea station texture once (call from the scene's create). */
export function makeTeaStationTextures(scene: Phaser.Scene) {
  if (scene.textures.exists(key("cup_shelf"))) return;
  const l = layout();
  const g = scene.make.graphics({}, false);
  for (const [id, draw] of Object.entries(DRAW)) {
    g.clear();
    draw(g, l);
    g.generateTexture(key(id), W, l.h);
  }
  g.destroy();
}
