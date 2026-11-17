import Phaser from "phaser";
import { Callbacks, type Room } from "@colyseus/sdk";
import {
  BUILD_TILE,
  BUILD_TILES,
  SHOP_BUILDING,
  SHOP_DOOR_X,
  SHOP_ENTER_ZONE,
  SHOP_LOT,
  YARD,
  cellRect,
  getBuildTile,
  parseTileKey,
  type BuildTileDef,
} from "@boba/shared";
import type { BobaShopState } from "@boba/shared/schema";

/** Walls / doors stand this tall: the cell is the floor footprint, the top face rises above it (3/4 view). */
export const WALL_RISE = 24;
const GROUND_DEPTH = -1000;
const FLOOR_DEPTH = -900;
const GRASS_KEY = "yard-grass";
const tileTextureKey = (kind: string) => `yard-tile-${kind}`;

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

/**
 * The yard outside the shop: grass, the shop's front (with its door), and the host's buildings (tiles synced in
 * state.tiles). Tile art is drawn with code into textures once.
 */
export class YardView {
  private tiles = new Map<string, Phaser.GameObjects.Image>();
  private unsubscribers: (() => void)[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    room: Room<BobaShopState>,
  ) {
    this.makeTextures();
    scene.add.tileSprite(YARD.x, YARD.y, YARD.width, YARD.height, GRASS_KEY).setOrigin(0).setDepth(GROUND_DEPTH);
    this.drawShopLot();
    this.drawShopFront();

    const $ = Callbacks.get(room);
    const refresh = (key: string) => this.refreshTile(key, room.state.tiles.get(key));
    this.unsubscribers.push(
      $.onAdd("tiles", (_kind, key) => refresh(key)),
      $.onChange("tiles", (key) => refresh(key)),
      $.onRemove("tiles", (_kind, key) => this.refreshTile(key, undefined)),
    );
  }

  destroy() {
    this.unsubscribers.forEach((off) => off());
    this.tiles.clear();
  }

  // ---------------------------------------------------------------- Tiles

  private refreshTile(key: string, kind: string | undefined) {
    this.tiles.get(key)?.destroy();
    this.tiles.delete(key);
    const def = getBuildTile(kind);
    const cell = parseTileKey(key);
    if (!def || !cell) return;
    const r = cellRect(cell.cx, cell.cy);
    const img = this.scene.add.image(r.left, r.bottom, tileTextureKey(def.kind)).setOrigin(0, 1);
    // Floors lie flat under everything; walls, fences and doors stand up and are depth-sorted with the players.
    img.setDepth(def.shape === "floor" ? FLOOR_DEPTH : r.bottom);
    this.tiles.set(key, img);
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
      g.clear();
      const height = this.drawTile(g, def);
      g.generateTexture(tileTextureKey(def.kind), BUILD_TILE, height);
    }
    g.destroy();
  }

  /** Draw one tile at the origin; returns the texture height. */
  private drawTile(g: Phaser.GameObjects.Graphics, def: BuildTileDef): number {
    const T = BUILD_TILE;
    const rnd = noise(def.kind.length * 97 + def.price);
    switch (def.shape) {
      case "floor": {
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
        return T;
      }
      case "wall": {
        const H = T + WALL_RISE;
        // Top face (light), then the front face with its pattern.
        g.fillStyle(def.accent).fillRect(0, 0, T, WALL_RISE);
        g.fillStyle(darken(def.accent, 0.85)).fillRect(0, WALL_RISE - 3, T, 3);
        g.fillStyle(def.color).fillRect(0, WALL_RISE, T, T);
        if (def.kind === "wall_brick") {
          g.fillStyle(def.accent);
          for (let row = 0; row < 4; row++) {
            const y = WALL_RISE + row * 10;
            g.fillRect(0, y + 9, T, 1);
            const off = row % 2 ? 10 : 0;
            for (let x = off; x < T; x += 20) g.fillRect(x, y, 1, 9);
          }
        } else if (def.kind === "wall_wood") {
          g.fillStyle(darken(def.color, 0.8));
          for (let x = 9; x < T; x += 10) g.fillRect(x, WALL_RISE, 1, T);
        } else {
          g.fillStyle(def.accent).fillRect(0, WALL_RISE + T - 8, T, 8);
        }
        g.lineStyle(1, darken(def.color, 0.6), 0.8).strokeRect(0.5, 0.5, T - 1, H - 1);
        return H;
      }
      case "fence": {
        // Two posts and two rails standing on the cell's back half.
        const H = T + 6;
        g.fillStyle(def.accent);
        g.fillRect(3, 4, 7, H - 10).fillRect(T - 10, 4, 7, H - 10);
        g.fillStyle(def.color);
        g.fillRect(0, 12, T, 6).fillRect(0, 26, T, 6);
        g.fillRect(4, 2, 5, H - 10).fillRect(T - 9, 2, 5, H - 10);
        return H;
      }
      case "door": {
        // Wooden threshold on the floor, door posts on both sides and a lintel above: you walk through it.
        const H = T + WALL_RISE;
        g.fillStyle(0xc8956a).fillRect(0, WALL_RISE, T, T);
        g.fillStyle(0xa87650);
        for (let y = WALL_RISE + 9; y < H; y += 10) g.fillRect(0, y, T, 1);
        g.fillStyle(def.color).fillRect(0, 0, 6, H).fillRect(T - 6, 0, 6, H).fillRect(0, 0, T, 10);
        g.fillStyle(def.accent).fillRect(0, 0, T, 4);
        // The door leaf, swung open against the left post.
        g.fillStyle(darken(def.color, 1.15)).fillRect(6, 10, 6, T + WALL_RISE - 14);
        g.fillStyle(0xffd166).fillCircle(10, WALL_RISE + 14, 1.5);
        return H;
      }
    }
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
