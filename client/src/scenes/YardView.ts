import Phaser from "phaser";
import { Callbacks, type Room } from "@colyseus/sdk";
import {
  BUILD_TILE,
  BUILD_TILES,
  CONNECT,
  OUTDOOR,
  PROP_ART_DROP,
  PROP_SCALE,
  RESTAURANT_BUILDING,
  RESTAURANT_DOOR_X,
  RESTAURANT_ENTER_ZONE,
  SHOP_BUILDING,
  SHOP_DOOR_X,
  SHOP_ENTER_ZONE,
  SHOP_LOT,
  VIEW_ORDER,
  WALL_THICKNESS,
  cellRect,
  connectMask,
  floorAt,
  getDecorationDef,
  normalizeTileRotation,
  parseTileKey,
  propAnchor,
  structureAt,
  tileKey,
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
 * How a prop is drawn facing `rotation`: furniture from the decorate catalog uses its per-facing artwork,
 * outdoor pixel art has a single facing. undefined = artwork not loaded.
 */
export function propTexture(scene: Phaser.Scene, def: BuildTileDef, rotation = 0): { key: string; scale: number } | undefined {
  const decor = def.decor ? getDecorationDef(def.decor) : undefined;
  if (decor) {
    const view = decor.rotation === "views" ? VIEW_ORDER[rotation] : undefined;
    const front = decorTextureKey(decor.kind, "front");
    const key = view ? decorTextureKey(decor.kind, view) : decor.views && scene.textures.exists(front) ? front : decorTextureKey(decor.kind);
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

/** Read access to the synced prop-facings map (tileRotations). */
interface RotationGetter {
  get(key: string): number | undefined;
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
  private readonly rotations: RotationGetter;

  constructor(
    private readonly scene: Phaser.Scene,
    room: Room<BobaShopState>,
  ) {
    this.tiles = { get: (key: string) => room.state.tiles?.get(key) };
    this.rotations = { get: (key: string) => room.state.tileRotations?.get(key) };
    this.makeTextures();
    // Pixel art: keep the pieces crisp when the canvas is scaled.
    for (const key of scene.textures.getTextureKeys()) {
      if (key.startsWith("build-")) scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
    scene.add.tileSprite(OUTDOOR.x, OUTDOOR.y, OUTDOOR.width, OUTDOOR.height, GRASS_KEY).setOrigin(0).setDepth(GROUND_DEPTH);
    this.drawShopLot();
    this.drawShopFront();
    this.drawRestaurantLot();
    this.drawRestaurantFront();

    // A change also changes how the neighbours connect (walls) or trim their floor: redraw the 3x3 block.
    const $ = Callbacks.get(room);
    const refresh = (key: string) => {
      const cell = parseTileKey(key);
      if (!cell) return;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) this.redrawCell(cell.cx + dx, cell.cy + dy);
    };
    // A facing change only redraws the prop itself.
    const refreshRotation = (key: string) => {
      const cell = parseTileKey(key);
      if (cell) this.redrawCell(cell.cx, cell.cy);
    };
    this.unsubscribers.push(
      $.onAdd("tiles", (_kind, key) => refresh(key)),
      $.onChange("tiles", (key) => refresh(key)),
      $.onRemove("tiles", (_kind, key) => refresh(key)),
      $.onAdd("tileRotations", (_rot, key) => refreshRotation(key)),
      $.onChange("tileRotations", (key) => refreshRotation(key)),
      $.onRemove("tileRotations", (_rot, key) => refreshRotation(key)),
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
      // Props stand on the bottom of their cell (pixel art at a whole-number scale so the pixels stay square),
      // facing whichever way the host turned them (see tileRotations).
      const rotation = normalizeTileRotation(structure, this.rotations.get(tileKey(cx, cy, "structure")));
      const tex = propTexture(this.scene, structure, rotation);
      if (tex) {
        const at = propAnchor(cx, cy);
        view.structure = this.scene.add.image(at.x, at.y + PROP_ART_DROP, tex.key).setOrigin(0.5, 1).setScale(tex.scale).setDepth(at.y);
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
      .text(lot.right + 320, lot.top + 60, "🏡 Đất trống · bấm 🔨 Xây để xây nhà", {
        fontFamily: "sans-serif",
        fontSize: "16px",
        color: "#3d2c29",
        backgroundColor: "#fdf6ecd9",
        padding: { x: 8, y: 4 },
      })
      .setOrigin(0.5)
      .setDepth(FLOOR_DEPTH + 1);
  }

  // ---------------------------------------------------------------- The restaurant, left of the shop

  /** Paved square in front of the restaurant and a path over to the shop's front yard. */
  private drawRestaurantLot() {
    const b = RESTAURANT_BUILDING;
    const g = this.scene.add.graphics().setDepth(FLOOR_DEPTH - 10);
    const top = b.bottom - 10;
    const pathY = SHOP_LOT.bottom - 90;
    // Stone square in front of the door, then a path to the shop's lot.
    g.fillStyle(0xd8d2c4).fillRoundedRect(b.left - 20, top, b.right - b.left + 40, 150, 16);
    g.fillStyle(0xcbb08a).fillRect(b.right + 20, pathY, SHOP_LOT.left - b.right + 10, 56);
    g.lineStyle(1, 0xb5ad9c, 0.8);
    for (let x = b.left - 4; x < b.right + 20; x += 28) g.lineBetween(x, top + 6, x, top + 144);
    for (let y = top + 24; y < top + 150; y += 28) g.lineBetween(b.left - 16, y, b.right + 16, y);
    g.lineStyle(2, 0xa39a87, 0.8).strokeRoundedRect(b.left - 20, top, b.right - b.left + 40, 150, 16);
    // Signpost on the shop's side pointing to the restaurant.
    this.scene.add
      .text(SHOP_LOT.left + 30, pathY - 22, "⬅ 🍽️ Nhà hàng", {
        fontFamily: "sans-serif",
        fontSize: "15px",
        fontStyle: "bold",
        color: "#3d2c29",
        backgroundColor: "#fdf6ecd9",
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0, 0.5)
      .setDepth(FLOOR_DEPTH + 1);
  }

  private drawRestaurantFront() {
    const b = RESTAURANT_BUILDING;
    const w = b.right - b.left;
    const roofBottom = b.top + 96;
    const g = this.scene.add.graphics().setDepth(b.bottom);
    const door = RESTAURANT_DOOR_X;

    // Brick facade.
    g.fillStyle(0xb5654a).fillRect(b.left, roofBottom, w, b.bottom - roofBottom);
    g.lineStyle(1, 0x8d4a35, 0.7);
    for (let y = roofBottom + 12, row = 0; y < b.bottom - 12; y += 12, row++) {
      g.lineBetween(b.left, y, b.right, y);
      for (let x = b.left + (row % 2) * 16; x < b.right; x += 32) g.lineBetween(x, y, x, y + 12);
    }
    g.fillStyle(0x5b3a29).fillRect(b.left, b.bottom - 12, w, 12);

    // Dark slate roof with a cream trim.
    g.fillStyle(0x3f4a52).fillRect(b.left - 16, b.top, w + 32, roofBottom - b.top);
    g.fillStyle(0x2f383f);
    for (let y = b.top + 14; y < roofBottom; y += 14) g.fillRect(b.left - 16, y, w + 32, 3);
    g.fillStyle(0xf1e6d6).fillRect(b.left - 16, roofBottom - 6, w + 32, 6);

    // Green awning.
    for (let x = b.left - 6, i = 0; x < b.right + 6; x += 20, i++) {
      g.fillStyle(i % 2 ? 0xfdf6ec : 0x2a9d8f).fillRect(x, roofBottom, 20, 22);
      g.fillStyle(i % 2 ? 0xfdf6ec : 0x2a9d8f).fillCircle(x + 10, roofBottom + 22, 10);
    }

    // Big windows with warm light and diners' silhouettes, on both sides of the door.
    for (const wx of [b.left + 110, b.right - 110]) {
      g.fillStyle(0x5b3a29).fillRect(wx - 80, b.top + 140, 160, 92);
      g.fillStyle(0xffe8b0).fillRect(wx - 74, b.top + 146, 148, 80);
      g.fillStyle(0xf4c983).fillRect(wx - 74, b.top + 196, 148, 30);
      g.fillStyle(0xd4a373).fillCircle(wx - 34, b.top + 186, 8).fillCircle(wx + 30, b.top + 188, 8);
      g.fillStyle(0xffffff, 0.45).fillTriangle(wx - 74, b.top + 146, wx - 40, b.top + 146, wx - 74, b.top + 186);
      g.fillStyle(0x5b3a29).fillRect(wx - 2, b.top + 146, 4, 80).fillRect(wx - 74, b.top + 184, 148, 4);
      // Flower box.
      g.fillStyle(0x8d5a3b).fillRect(wx - 82, b.top + 230, 164, 10);
      for (let fx = wx - 74; fx < wx + 80; fx += 14) g.fillStyle(fx % 28 ? 0xe76f51 : 0xffd166).fillCircle(fx, b.top + 228, 5);
    }

    // Double door (open, warm light inside) and a doormat in front of it.
    const doorTop = b.bottom - 104;
    g.fillStyle(0x3d2c29).fillRect(door - 40, doorTop - 8, 80, 112);
    g.fillStyle(0xffe8b0).fillRect(door - 34, doorTop, 68, 104);
    g.fillStyle(0x6d4c41).fillRect(door - 34, doorTop, 14, 104).fillRect(door + 20, doorTop, 14, 104);
    g.fillStyle(0xffd166).fillCircle(door - 24, doorTop + 56, 2).fillCircle(door + 24, doorTop + 56, 2);
    const mat = RESTAURANT_ENTER_ZONE;
    this.scene.add
      .rectangle((mat.left + mat.right) / 2, (mat.top + mat.bottom) / 2 + 2, mat.right - mat.left, mat.bottom - mat.top - 4, 0x2a9d8f)
      .setStrokeStyle(2, 0x1f6f66)
      .setDepth(FLOOR_DEPTH + 2);

    // Sign on the roof.
    g.fillStyle(0x3d2c29).fillRoundedRect(door - 120, b.top + 22, 240, 46, 10);
    g.lineStyle(3, 0xd4a373).strokeRoundedRect(door - 120, b.top + 22, 240, 46, 10);
    this.scene.add
      .text(door, b.top + 45, "🍽️ Nhà hàng", { fontFamily: "sans-serif", fontSize: "24px", fontStyle: "bold", color: "#fdf6ec" })
      .setOrigin(0.5)
      .setDepth(b.bottom + 1);
    this.scene.add
      .text(door, mat.bottom + 14, "Bước lên thảm để vào nhà hàng", {
        fontFamily: "sans-serif",
        fontSize: "12px",
        color: "#3d2c29",
        backgroundColor: "#fdf6ecd9",
        padding: { x: 4, y: 1 },
      })
      .setOrigin(0.5)
      .setDepth(FLOOR_DEPTH + 3);

    // Lanterns and potted plants by the door.
    for (const [x, key, height] of [
      [door - 70, "decor-lantern_lit", 48],
      [door + 70, "decor-lantern_lit", 48],
      [b.left + 20, "decor-banana_plant", 90],
      [b.right - 20, "decor-banana_plant", 90],
    ] as const) {
      if (!this.scene.textures.exists(key)) continue;
      const img = this.scene.add.image(x, b.bottom + 6, key).setOrigin(0.5, 1);
      img.setScale(height / img.height).setDepth(b.bottom + 6);
    }
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
