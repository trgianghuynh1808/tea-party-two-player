import Phaser from "phaser";
import { StationType, isProcess, type ProcessId, type StationDef } from "@boba/shared";
import { teaStationTexture } from "./TeaArt";

// Restaurant kitchen stations, drawn with code (front view, like the tea shop's machines): a counter / stove
// with the appliance on top. The art stands on the bottom edge of the station box and may rise KITCHEN_ART_RISE px
// above it (pots, blender jugs, the coffee machine).

export const KITCHEN_ART_RISE = 16;
const W = 84;
const H = 60 + KITCHEN_ART_RISE;
/** Counter top surface and front face (texture px). */
const TOP = KITCHEN_ART_RISE;
const FRONT = TOP + 20;
const CRATE_W = 58;
const CRATE_H = 52;
const OUTLINE = 0x3d2c29;

const key = (name: string) => `kitchen-${name}`;

/** Texture of a kitchen station (undefined = not a kitchen station drawn with code). */
export function kitchenStationTexture(def: StationDef): string | undefined {
  if (def.type === StationType.Cooker && def.process) return key(def.process);
  if (def.type === StationType.Crate) return key("crate");
  if (def.type === StationType.Shelf) return key("shelf");
  if (def.type === StationType.Machine || def.type === StationType.CupShelf) return teaStationTexture(def);
  return undefined;
}

type G = Phaser.GameObjects.Graphics;

function counter(g: G, top: number, front: number, edge: number) {
  g.fillStyle(front).fillRect(2, FRONT, W - 4, H - FRONT - 2);
  g.fillStyle(top).fillRoundedRect(0, TOP, W, FRONT - TOP + 4, 4);
  g.fillStyle(edge).fillRect(0, FRONT, W, 3);
  g.fillStyle(0x000000, 0.15).fillRect(2, H - 8, W - 4, 6);
  g.lineStyle(2, OUTLINE, 0.8).strokeRoundedRect(1, TOP, W - 2, H - TOP - 1, 4);
}

/** Two cupboard doors with knobs on the front. */
function doors(g: G, color: number) {
  g.lineStyle(1.5, color, 0.9).strokeRect(8, FRONT + 8, W / 2 - 12, H - FRONT - 18).strokeRect(W / 2 + 4, FRONT + 8, W / 2 - 12, H - FRONT - 18);
  g.fillStyle(color).fillCircle(W / 2 - 8, FRONT + 20, 2).fillCircle(W / 2 + 8, FRONT + 20, 2);
}

/** Stove knobs on the front. */
function knobs(g: G) {
  for (const x of [16, 30, 54, 68]) g.fillStyle(0x2b2b2b).fillCircle(x, FRONT + 10, 4).fillStyle(0xd7dde3).fillRect(x - 1, FRONT + 6, 2, 4);
}

const STEEL = { top: 0x3a3f47, front: 0xa7b0ba, edge: 0x6c757f };

const DRAW: Record<ProcessId, (g: G) => void> = {
  chop(g) {
    counter(g, 0xdcc29c, 0x9c7457, 0x7a5a43);
    doors(g, 0x6d4c41);
    g.fillStyle(0xf3e2c4).fillRoundedRect(10, TOP + 3, 52, 15, 3).lineStyle(1.5, 0xc29a78).strokeRoundedRect(10, TOP + 3, 52, 15, 3);
    g.fillStyle(0xd7dde3).fillRect(62, TOP + 6, 16, 4);
    g.fillStyle(0x5b3a29).fillRect(54, TOP + 6, 9, 4);
  },
  fry(g) {
    counter(g, STEEL.top, STEEL.front, STEEL.edge);
    knobs(g);
    g.lineStyle(2, 0xe76f51, 0.9).strokeEllipse(40, TOP + 10, 40, 14);
    g.fillStyle(0x1f1f1f).fillEllipse(40, TOP + 9, 38, 14);
    g.fillStyle(0x3c3c3c).fillEllipse(40, TOP + 9, 30, 10);
    g.fillStyle(0x1f1f1f).fillRect(58, TOP + 7, 24, 4);
  },
  boil(g) {
    counter(g, STEEL.top, STEEL.front, STEEL.edge);
    knobs(g);
    // Steel pot rising above the stove.
    g.fillStyle(0x9aa7b4).fillRect(20, 6, 44, TOP + 10);
    g.fillStyle(0xc3ccd5).fillRect(24, 8, 6, TOP + 6);
    g.fillStyle(0x6c757f).fillEllipse(42, 6, 44, 10);
    g.fillStyle(0x4d5560).fillRect(14, 12, 6, 4).fillRect(64, 12, 6, 4);
    g.lineStyle(2, OUTLINE, 0.7).strokeRect(20, 6, 44, TOP + 10);
    g.fillStyle(0xffffff, 0.5).fillCircle(34, 2, 3).fillCircle(46, 0, 2.5);
  },
  grill(g) {
    counter(g, 0x2b2b2b, 0x5a5f66, 0x3a3f47);
    knobs(g);
    g.fillStyle(0xe76f51, 0.55).fillRoundedRect(6, TOP + 3, W - 12, 15, 3);
    g.lineStyle(2, 0x8a929c);
    for (let x = 10; x < W - 8; x += 7) g.lineBetween(x, TOP + 3, x, TOP + 18);
  },
  bake(g) {
    counter(g, 0x6b6f75, 0x8a929c, 0x4d5560);
    for (const x of [20, 34, 48, 62]) g.fillStyle(0x2b2b2b).fillCircle(x, TOP + 10, 3);
    g.fillStyle(0x3a2a20).fillRoundedRect(12, FRONT + 9, W - 24, 24, 4);
    g.fillStyle(0xf4a261, 0.85).fillRoundedRect(16, FRONT + 13, W - 32, 16, 3);
    g.fillStyle(0xd7dde3).fillRect(16, FRONT + 4, W - 32, 3);
  },
  deepfry(g) {
    counter(g, STEEL.top, STEEL.front, STEEL.edge);
    knobs(g);
    g.fillStyle(0x6c757f).fillRect(12, TOP + 1, 56, 18);
    g.fillStyle(0xe9b949).fillRect(15, TOP + 4, 50, 12);
    g.fillStyle(0xfff3b0, 0.7).fillCircle(26, TOP + 9, 2).fillCircle(44, TOP + 11, 1.5).fillCircle(54, TOP + 7, 2);
    g.lineStyle(2, 0x2b2b2b).lineBetween(64, TOP + 8, 78, 2);
  },
  blend(g) {
    counter(g, 0xf1e6d6, 0xd4b896, 0xb08968);
    doors(g, 0x8d6e63);
    g.fillStyle(0x3d3d3d).fillRoundedRect(28, TOP + 4, 28, 14, 3);
    g.fillStyle(0xdff3fb, 0.9).lineStyle(1.5, 0x8fb8c9);
    g.beginPath().moveTo(26, 0).lineTo(58, 0).lineTo(54, TOP + 5).lineTo(30, TOP + 5).closePath().fillPath().strokePath();
    g.fillStyle(0x2b2b2b).fillRect(25, 0, 34, 3);
  },
  brew(g) {
    counter(g, 0xf1e6d6, 0xd4b896, 0xb08968);
    doors(g, 0x8d6e63);
    // Espresso machine on the counter.
    g.fillStyle(0x6d4c41).fillRoundedRect(14, 0, 56, TOP + 14, 5).lineStyle(2, OUTLINE, 0.7).strokeRoundedRect(14, 0, 56, TOP + 14, 5);
    g.fillStyle(0xc3ccd5).fillRect(20, 5, 44, 8);
    g.fillStyle(0x2b2b2b).fillRect(36, 13, 12, 6);
    g.fillStyle(0xe76f51).fillCircle(24, 9, 2).fillStyle(0x90be6d).fillCircle(60, 9, 2);
  },
};

/** Draw every kitchen texture once (call from the scene's create). */
export function makeKitchenStationTextures(scene: Phaser.Scene) {
  if (scene.textures.exists(key("crate"))) return;
  const g = scene.make.graphics({}, false);
  for (const [process, draw] of Object.entries(DRAW)) {
    if (!isProcess(process)) continue;
    g.clear();
    draw(g);
    g.generateTexture(key(process), W, H);
  }

  // Ingredient crate (the ingredient's picture is put on top by the scene).
  g.clear();
  g.fillStyle(0xc8956a).fillRect(1, 8, CRATE_W - 2, CRATE_H - 9);
  g.fillStyle(0x5b3a29).fillRect(4, 4, CRATE_W - 8, 12);
  g.fillStyle(0xa87650);
  for (let y = 22; y < CRATE_H - 2; y += 10) g.fillRect(2, y, CRATE_W - 4, 2);
  g.fillStyle(0x8d5a3b).fillRect(3, 8, 4, CRATE_H - 10).fillRect(CRATE_W - 7, 8, 4, CRATE_H - 10);
  g.lineStyle(2, OUTLINE, 0.85).strokeRect(1, 4, CRATE_W - 2, CRATE_H - 5);
  g.generateTexture(key("crate"), CRATE_W, CRATE_H);

  // Dish shelf: a wooden cabinet with an open shelf on top (the plates / bowls / glasses are put on it by the scene).
  g.clear();
  g.fillStyle(0xc29a78).fillRect(4, 0, W - 8, TOP + 6);
  g.fillStyle(0x9c7457).fillRect(4, TOP - 2, W - 8, 4);
  g.lineStyle(2, OUTLINE, 0.7).strokeRect(4, 0, W - 8, TOP + 6);
  counter(g, 0xdcc29c, 0x9c7457, 0x7a5a43);
  doors(g, 0x6d4c41);
  g.generateTexture(key("shelf"), W, H);
  g.destroy();
}
