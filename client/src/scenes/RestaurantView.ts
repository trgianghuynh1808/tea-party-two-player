import Phaser from "phaser";
import { RESTAURANT, RESTAURANT_EXIT_ZONE, RESTAURANT_FURNITURE, WALL_BOTTOM, WALL_SKIRTING } from "@boba/shared";
import { addStaticDecoration } from "./DecorController";

const FLOOR_DEPTH = -1000;
const WALL_DEPTH = -900;
const TILE_KEY = "restaurant-tile";
/** The kitchen is tiled; the dining room (right of this local x) has the wooden floor. */
const DINING_X = 990;

/** Pot plants and lanterns around the dining room (local coordinates, catalog kinds). */
const DINING_DECOR: { kind: string; x: number; y: number }[] = [
  { kind: "fern_large", x: 1010, y: 690 },
  { kind: "banana_plant", x: 1375, y: 280 },
  { kind: "fiddle_leaf", x: 1010, y: 280 },
  { kind: "plant_tall_stand", x: 1370, y: 690 },
  { kind: "lantern_lit", x: 1180, y: 300 },
];

/**
 * The restaurant's interior (static): tiled kitchen and wooden dining room, back wall with a tiled splashback
 * behind the cookers, the sign over the dining room, the dining tables and the doormat out to the yard.
 * Stations are drawn by ShopScene like the tea shop's.
 */
export class RestaurantView {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly fs: (px: number) => string,
    floorTexture: string,
  ) {
    this.makeTextures();
    const R = RESTAURANT;
    scene.add.tileSprite(R.x, R.y, DINING_X, R.height, TILE_KEY).setOrigin(0).setDepth(FLOOR_DEPTH);
    if (scene.textures.exists(floorTexture)) {
      scene.add
        .tileSprite(R.x + DINING_X, R.y, R.width - DINING_X, R.height, floorTexture)
        .setOrigin(0)
        .setDepth(FLOOR_DEPTH);
    }
    this.drawWall();
    this.drawExit();
    for (const piece of RESTAURANT_FURNITURE) addStaticDecoration(scene, piece);
    for (const d of DINING_DECOR) addStaticDecoration(scene, { kind: d.kind, x: R.x + d.x, y: R.y + d.y });
  }

  private makeTextures() {
    if (this.scene.textures.exists(TILE_KEY)) return;
    const g = this.scene.make.graphics({}, false);
    // Cream and terracotta checker tiles.
    g.fillStyle(0xf1e6d6).fillRect(0, 0, 80, 80);
    g.fillStyle(0xd9a38a).fillRect(0, 0, 40, 40).fillRect(40, 40, 40, 40);
    g.lineStyle(1, 0xb08968, 0.35).strokeRect(0.5, 0.5, 39, 39).strokeRect(40.5, 0.5, 39, 39).strokeRect(0.5, 40.5, 39, 39).strokeRect(40.5, 40.5, 39, 39);
    g.generateTexture(TILE_KEY, 80, 80);
    g.destroy();
  }

  private drawWall() {
    const R = RESTAURANT;
    const g = this.scene.add.graphics().setDepth(WALL_DEPTH);
    const paperBottom = WALL_BOTTOM - WALL_SKIRTING;
    // Sage wallpaper with thin stripes.
    g.fillStyle(0xcfe0c3).fillRect(R.x, R.y, R.width, paperBottom);
    g.fillStyle(0xc2d6b4);
    for (let x = R.x + 12; x < R.x + R.width; x += 30) g.fillRect(x, R.y, 6, paperBottom);
    // White tiles behind the kitchen.
    g.fillStyle(0xf7f4ee).fillRect(R.x, R.y + 46, DINING_X - 30, paperBottom - 46);
    g.lineStyle(1, 0xd8d2c8, 0.9);
    for (let y = R.y + 46; y < R.y + paperBottom; y += 12) g.lineBetween(R.x, y, R.x + DINING_X - 30, y);
    for (let y = R.y + 46, row = 0; y < R.y + paperBottom; y += 12, row++) {
      for (let x = R.x + (row % 2) * 12; x < R.x + DINING_X - 30; x += 24) g.lineBetween(x, y, x, y + 12);
    }
    // Moulding, skirting board, shadow on the floor.
    g.fillStyle(0x6b8f5e).fillRect(R.x, R.y, R.width, 6);
    g.fillStyle(0x5b3a29).fillRect(R.x, R.y + paperBottom, R.width, WALL_SKIRTING);
    g.fillStyle(0x8d5a3b).fillRect(R.x, R.y + paperBottom, R.width, 3);
    g.fillGradientStyle(0x3d2c29, 0x3d2c29, 0x3d2c29, 0x3d2c29, 0.28, 0.28, 0, 0);
    g.fillRect(R.x, R.y + WALL_BOTTOM, R.width, 12);

    // Sign over the dining room... and the kitchen pass rail with order tickets.
    const signX = R.x + DINING_X + (R.width - DINING_X) / 2;
    g.fillStyle(0x3d2c29).fillRoundedRect(signX - 130, R.y + 16, 260, 44, 10);
    g.lineStyle(3, 0xd4a373).strokeRoundedRect(signX - 130, R.y + 16, 260, 44, 10);
    this.scene.add
      .text(signX, R.y + 38, "🍽️ Nhà hàng", { fontFamily: "sans-serif", fontSize: this.fs(22), fontStyle: "bold", color: "#fdf6ec" })
      .setOrigin(0.5)
      .setDepth(WALL_DEPTH + 1);
    g.fillStyle(0x8a929c).fillRect(R.x + 60, R.y + 22, 300, 4);
    for (let i = 0; i < 6; i++) {
      g.fillStyle(0xfffdf5).fillRect(R.x + 72 + i * 48, R.y + 24, 26, 20);
      g.lineStyle(1, 0xc9bfae).strokeRect(R.x + 72 + i * 48, R.y + 24, 26, 20);
      g.fillStyle(0xc9bfae).fillRect(R.x + 76 + i * 48, R.y + 30, 18, 2).fillRect(R.x + 76 + i * 48, R.y + 35, 12, 2);
    }
  }

  /** Doormat at the bottom of the dining room: stepping on it goes out to the yard. */
  private drawExit() {
    const z = RESTAURANT_EXIT_ZONE;
    const cx = (z.left + z.right) / 2;
    const cy = RESTAURANT.y + RESTAURANT.height - 10;
    this.scene.add.rectangle(cx, cy, z.right - z.left, 20, 0xe76f51).setStrokeStyle(2, 0x9a4432).setDepth(WALL_DEPTH + 10);
    this.scene.add
      .text(cx, cy, "⬇ Ra sân", { fontFamily: "sans-serif", fontSize: this.fs(11), fontStyle: "bold", color: "#fdf6ec" })
      .setOrigin(0.5)
      .setDepth(WALL_DEPTH + 11);
  }
}
