import Phaser from "phaser";
import { Callbacks, type Room } from "@colyseus/sdk";
import {
  BUILD_TILE,
  BUILD_TILES,
  CONNECT,
  PROP_SCALE,
  SHOP_BUILDING,
  SHOP_DOOR_X,
  SHOP_ENTER_ZONE,
  SHOP_LOT,
  WALL_THICKNESS,
  YARD,
  cellRect,
  connectMask,
  floorAt,
  getDecorationDef,
  parseTileKey,
  propAnchor,
  structureAt,
  type BuildTileDef,
  type TileGetter,
} from "@boba/shared";
import type { BobaShopState } from "@boba/shared/schema";
import { decorTextureKey } from "./DecorController";

const GROUND_DEPTH = -1000;
const FLOOR_DEPTH = -900;
const GRASS_KEY = "yard-grass";
const floorTextureKey = (kind: string) => `yard-floor-${kind}`;
/** Art of walls / fences / doors: client/public/assets/build/ (client/assets-src/tools/draw_build_tiles.py). */
const pieceKey = (name: string) => `build-${name}`;
const pieceUrl = (name: string) => `assets/build/${name}.png`;
/** Outdoor props (trees, bench...): client/public/assets/decor/yard/ (client/assets-src/tools/draw_yard_props.py). */
export const propKey = (kind: string) => `build-prop-${kind}`;
export const propUrl = (image: string) => `assets/decor/yard/${image}.png`;

/**
 * How a prop is drawn: yard pixel art at PROP_SCALE, or furniture from the decorate catalog (front view)
 * at its catalog height. undefined = artwork not loaded.
 */
export function propTexture(scene: Phaser.Scene, def: BuildTileDef): { key: string; scale: number } | undefined {
  const decor = def.decor ? getDecorationDef(def.decor) : undefined;
  if (decor) {
    const front = decorTextureKey(decor.kind, "front");
    const key = decor.views && scene.textures.exists(front) ? front : decorTextureKey(decor.kind);
    if (!scene.textures.exists(key)) return undefined;
    const height = scene.textures.getFrame(key).height;
    return { key, scale: (decor.imageHeight ?? decor.height) / height };
  }
  const key = propKey(def.kind);
  return scene.textures.exists(key) ? { key, scale: PROP_SCALE } : undefined;
}

/** Catalog thumbnail of a prop (build panel), or undefined for tiles drawn with code. */
export function propThumbnail(def: BuildTileDef): string | undefined {
  const decor = def.decor ? getDecorationDef(def.decor) : undefined;
  if (decor) return decor.views?.front ?? decor.image;
  return def.image && propUrl(def.image);
}

/** Load the wall / fence / door pieces (call from the scene's preload). */
export function preloadBuildTextures(scene: Phaser.Scene) {
  for (const def of BUILD_TILES) {
    if (def.shape === "wall" || def.shape === "fence") {
      for (let mask = 0; mask < 16; mask++) {
        scene.load.image(pieceKey(`${def.kind}_${mask}`), pieceUrl(`${def.kind}_${mask}`));
        if (def.shape === "wall" && mask & CONNECT.S) scene.load.image(pieceKey(`${def.kind}_${mask}d`), pieceUrl(`${def.kind}_${mask}d`));
      }
    }
  }
  for (const name of ["door_h", "door_v"]) scene.load.image(pieceKey(name), pieceUrl(name));
  for (const def of BUILD_TILES) if (def.shape === "prop" && def.image) scene.load.image(propKey(def.kind), propUrl(def.image));
}

/** Which piece art shows a structure, given its neighbours. */
function pieceName(tiles: TileGetter, def: BuildTileDef, cx: number, cy: number): string {
  const mask = connectMask(tiles, cx, cy);
  if (def.shape === "door") {
    const vertical = mask & (CONNECT.N | CONNECT.S) && !(mask & (CONNECT.E | CONNECT.W));
    return vertical ? "door_v" : "door_h";
  }
  // A wall ending at a door to its south shows its end face (the door is an opening, not more wall).
  const doorSouth = def.shape === "wall" && structureAt(tiles, cx, cy + 1)?.shape === "door";
  return `${def.kind}_${mask}${doorSouth ? "d" : ""}`;
}

/** Deterministic noise so the drawn textures look the same for everyone. */
function noise(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const darken = (color: number, k: number) => {
  const c = Phaser.Display.Color.IntegerToColor(color);
  return Phaser.Display.Color.GetColor(c.red * k, c.green * k, c.blue * k);
};

interface CellView {
  floor?: Phaser.GameObjects.Image;
  structure?: Phaser.GameObjects.Image;
}

/**
 * The yard outside the shop: grass, the shop's front (with its door), and the host's buildings (tiles synced in
 * state.tiles, two layers per cell). Floors are drawn with code; walls, fences and doors are pixel-art pieces
 * picked by how they connect to their neighbours.
 */
export class YardView {
  private cells = new Map<string, CellView>();
  private unsubscribers: (() => void)[] = [];
  private readonly tiles: TileGetter;

  constructor(
    private readonly scene: Phaser.Scene,
    room: Room<BobaShopState>,
  ) {
    this.tiles = { get: (key: string) => room.state.tiles?.get(key) };
    this.makeTextures();
    // Pixel art: keep the pieces crisp when the canvas is scaled.
    for (const key of scene.textures.getTextureKeys()) {
      if (key.startsWith("build-")) scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
    scene.add.tileSprite(YARD.x, YARD.y, YARD.width, YARD.height, GRASS_KEY).setOrigin(0).setDepth(GROUND_DEPTH);
    this.drawShopLot();
    this.drawShopFront();

    // A change also changes how the neighbours connect (walls) or trim their floor: redraw the 3x3 block.
    const $ = Callbacks.get(room);
    const refresh = (key: string) => {
      const cell = parseTileKey(key);
      if (!cell) return;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) this.redrawCell(cell.cx + dx, cell.cy + dy);
    };
    this.unsubscribers.push(
      $.onAdd("tiles", (_kind, key) => refresh(key)),
      $.onChange("tiles", (key) => refresh(key)),
      $.onRemove("tiles", (_kind, key) => refresh(key)),
    );
  }

  destroy() {
    this.unsubscribers.forEach((off) => off());
    this.cells.clear();
  }

  // ---------------------------------------------------------------- Tiles

  private redrawCell(cx: number, cy: number) {
    const id = `${cx},${cy}`;
    const old = this.cells.get(id);
    old?.floor?.destroy();
    old?.structure?.destroy();
    this.cells.delete(id);

    const floor = floorAt(this.tiles, cx, cy);
    const structure = structureAt(this.tiles, cx, cy);
    if (!floor && !structure) return;
    const r = cellRect(cx, cy);
    const view: CellView = {};

    if (floor) {
      const img = this.scene.add.image(r.left, r.top, floorTextureKey(floor.kind)).setOrigin(0).setDepth(FLOOR_DEPTH);
      // Under a wall, the floor stops at the wall on the sides without floor next to it (nothing sticks out).
      if (structure && structure.shape !== "prop") {
        const a = (BUILD_TILE - WALL_THICKNESS) / 2;
        const b = (BUILD_TILE + WALL_THICKNESS) / 2;
        const x0 = floorAt(this.tiles, cx - 1, cy) ? 0 : a;
        const x1 = floorAt(this.tiles, cx + 1, cy) ? BUILD_TILE : b;
        const y0 = floorAt(this.tiles, cx, cy - 1) ? 0 : a;
        const y1 = floorAt(this.tiles, cx, cy + 1) ? BUILD_TILE : b;
        img.setCrop(x0, y0, x1 - x0, y1 - y0);
      }
      view.floor = img;
    }

    if (structure?.shape === "prop") {
      // Props stand on the bottom of their cell (pixel art at a whole-number scale so the pixels stay square).
      const tex = propTexture(this.scene, structure);
      if (tex) {
        const at = propAnchor(cx, cy);
        view.structure = this.scene.add.image(at.x, at.y + 2, tex.key).setOrigin(0.5, 1).setScale(tex.scale).setDepth(at.y);
      }
    } else if (structure) {
      const key = pieceKey(pieceName(this.tiles, structure, cx, cy));
      if (this.scene.textures.exists(key)) {
        // The piece stands on a thin strip through the middle of the cell: sort it by the strip's front edge,
        // so a player just south of the wall is drawn in front of it and one behind it is hidden.
        const img = this.scene.add.image(r.left, r.bottom, key).setOrigin(0, 1);
        img.setDepth(r.top + (BUILD_TILE + WALL_THICKNESS) / 2);
        view.structure = img;
      }
    }
    this.cells.set(id, view);
  }

  // ---------------------------------------------------------------- Textures

  private makeTextures() {
    if (this.scene.textures.exists(GRASS_KEY)) return; // scene restarted: already made
    const g = this.scene.make.graphics({}, false);

    // Grass: soft green with a few darker / lighter tufts.
    const rnd = noise(7);
    g.fillStyle(0x93c56a).fillRect(0, 0, 96, 96);
    for (let i = 0; i < 70; i++) {
      g.fillStyle(rnd() < 0.6 ? 0x84b65c : 0xa4d27b).fillRect(Math.floor(rnd() * 96), Math.floor(rnd() * 96), 2, 3 + Math.floor(rnd() * 3));
    }
    for (let i = 0; i < 3; i++) {
      g.fillStyle(0xfff3b0).fillCircle(rnd() * 96, rnd() * 96, 1.5);
    }
    g.generateTexture(GRASS_KEY, 96, 96);

    for (const def of BUILD_TILES) {
      if (def.shape !== "floor") continue;
      g.clear();
      this.drawFloor(g, def);
      g.generateTexture(floorTextureKey(def.kind), BUILD_TILE, BUILD_TILE);
    }
    g.destroy();
  }

  private drawFloor(g: Phaser.GameObjects.Graphics, def: BuildTileDef) {
    const T = BUILD_TILE;
    const rnd = noise(def.kind.length * 97 + def.price);
    g.fillStyle(def.color).fillRect(0, 0, T, T);
    if (def.kind === "floor_wood") {
      g.fillStyle(def.accent);
      for (let y = 9; y < T; y += 10) g.fillRect(0, y, T, 1);
      g.fillRect(14, 0, 1, 10).fillRect(30, 10, 1, 10).fillRect(8, 20, 1, 10).fillRect(24, 30, 1, 10);
    } else if (def.kind === "floor_stone") {
      g.fillStyle(def.accent).fillRect(0, 19, T, 2).fillRect(19, 0, 2, 20).fillRect(9, 20, 2, 20).fillRect(29, 20, 2, 20);
    } else if (def.kind === "floor_tile" || def.kind === "floor_pink") {
      g.fillStyle(def.accent).fillRect(0, 0, T / 2, T / 2).fillRect(T / 2, T / 2, T / 2, T / 2);
    } else {
      g.fillStyle(def.accent);
      for (let i = 0; i < 14; i++) g.fillRect(Math.floor(rnd() * T), Math.floor(rnd() * T), 2, 2);
    }
    g.lineStyle(1, darken(def.color, 0.85), 0.6).strokeRect(0.5, 0.5, T - 1, T - 1);
  }

  // ---------------------------------------------------------------- The shop, seen from outside

  /** Paved front yard of the shop (nothing can be built there) and a path towards the open land. */
  private drawShopLot() {
    const g = this.scene.add.graphics().setDepth(FLOOR_DEPTH - 10);
    const lot = SHOP_LOT;
    g.fillStyle(0xd9c3a0, 0.55).fillRoundedRect(lot.left + 6, SHOP_BUILDING.bottom - 10, lot.right - lot.left - 12, lot.bottom - SHOP_BUILDING.bottom, 14);
    g.fillStyle(0xcbb08a).fillRect(SHOP_DOOR_X - 28, SHOP_BUILDING.bottom, 56, lot.bottom - SHOP_BUILDING.bottom);
    g.lineStyle(2, 0xb0916a, 0.7).strokeRoundedRect(lot.left + 6, SHOP_BUILDING.bottom - 10, lot.right - lot.left - 12, lot.bottom - SHOP_BUILDING.bottom, 14);
    this.scene.add
      .text(lot.right + 320, lot.top + 60, "🏡 Đất trống · chủ phòng bấm 🔨 Xây để xây nhà", {
        fontFamily: "sans-serif",
        fontSize: "16px",
        color: "#3d2c29",
        backgroundColor: "#fdf6ecd9",
        padding: { x: 8, y: 4 },
      })
      .setOrigin(0.5)
      .setDepth(FLOOR_DEPTH + 1);
  }

  private drawShopFront() {
    const b = SHOP_BUILDING;
    const w = b.right - b.left;
    const roofBottom = b.top + 90;
    const g = this.scene.add.graphics().setDepth(b.bottom);

    // Facade: cream wallpaper stripes, like the inside.
    g.fillStyle(0xf6e7d2).fillRect(b.left, roofBottom, w, b.bottom - roofBottom);
    g.fillStyle(0xefdcc2);
    for (let x = b.left + 10; x < b.right; x += 34) g.fillRect(x, roofBottom, 14, b.bottom - roofBottom);
    g.fillStyle(0x9c7457).fillRect(b.left, b.bottom - 12, w, 12);

    // Roof: overlapping clay tiles, slightly wider than the walls.
    g.fillStyle(0xb5543c).fillRect(b.left - 14, b.top, w + 28, roofBottom - b.top);
    g.fillStyle(0x9a4432);
    for (let y = b.top + 14; y < roofBottom; y += 14) g.fillRect(b.left - 14, y, w + 28, 3);
    g.fillStyle(0xd9826b).fillRect(b.left - 14, b.top, w + 28, 6);

    // Striped awning under the roof.
    const awningTop = roofBottom;
    for (let x = b.left - 6, i = 0; x < b.right + 6; x += 20, i++) {
      g.fillStyle(i % 2 ? 0xfdf6ec : 0xe76f51).fillRect(x, awningTop, 20, 22);
      g.fillStyle(i % 2 ? 0xfdf6ec : 0xe76f51).fillCircle(x + 10, awningTop + 22, 10);
    }

    // Windows on both sides of the door.
    for (const wx of [b.left + 70, b.right - 70]) {
      g.fillStyle(0x9c7457).fillRect(wx - 44, b.top + 135, 88, 72);
      g.fillStyle(0xbfe6f7).fillRect(wx - 38, b.top + 141, 76, 60);
      g.fillStyle(0xffffff, 0.5).fillTriangle(wx - 38, b.top + 141, wx - 10, b.top + 141, wx - 38, b.top + 175);
      g.fillStyle(0x9c7457).fillRect(wx - 2, b.top + 141, 4, 60).fillRect(wx - 38, b.top + 169, 76, 4);
      g.fillStyle(0xe76f51).fillRect(wx - 46, b.top + 205, 92, 8);
    }

    // Door (open, warm light inside) and a doormat in front of it.
    const doorTop = b.bottom - 96;
    g.fillStyle(0x6d4c41).fillRect(SHOP_DOOR_X - 32, doorTop - 6, 64, 102);
    g.fillStyle(0xffe8b0).fillRect(SHOP_DOOR_X - 26, doorTop, 52, 96);
    g.fillStyle(0x8d5a3b).fillRect(SHOP_DOOR_X - 26, doorTop, 14, 96);
    g.fillStyle(0xffd166).fillCircle(SHOP_DOOR_X - 16, doorTop + 52, 2);
    const mat = SHOP_ENTER_ZONE;
    this.scene.add
      .rectangle((mat.left + mat.right) / 2, (mat.top + mat.bottom) / 2 + 2, mat.right - mat.left, mat.bottom - mat.top - 4, 0xe76f51)
      .setStrokeStyle(2, 0x9a4432)
      .setDepth(FLOOR_DEPTH + 2);

    // Sign on the roof.
    g.fillStyle(0x3d2c29).fillRoundedRect(SHOP_DOOR_X - 90, b.top + 22, 180, 40, 8);
    this.scene.add
      .text(SHOP_DOOR_X, b.top + 42, "🧋 Tiệm Trà", { fontFamily: "sans-serif", fontSize: "22px", fontStyle: "bold", color: "#fdf6ec" })
      .setOrigin(0.5)
      .setDepth(b.bottom + 1);
    this.scene.add
      .text(SHOP_DOOR_X, mat.bottom + 14, "Bước lên thảm để vào quán", {
        fontFamily: "sans-serif",
        fontSize: "12px",
        color: "#3d2c29",
        backgroundColor: "#fdf6ecd9",
        padding: { x: 4, y: 1 },
      })
      .setOrigin(0.5)
      .setDepth(FLOOR_DEPTH + 3);

    // Potted plants by the door (furniture art already loaded for the decorate catalog).
    for (const [x, key] of [
      [SHOP_DOOR_X - 56, "decor-fern_large"],
      [SHOP_DOOR_X + 56, "decor-fern_large"],
    ] as const) {
      if (!this.scene.textures.exists(key)) continue;
      const img = this.scene.add.image(x, b.bottom + 4, key).setOrigin(0.5, 1);
      img.setScale(54 / img.height).setDepth(b.bottom + 4);
    }
  }
}
