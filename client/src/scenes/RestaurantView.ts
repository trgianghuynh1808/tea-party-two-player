import Phaser from "phaser";
import { RESTAURANT, RESTAURANT_EXIT_ZONE, WALL_BOTTOM, WALL_SKIRTING } from "@boba/shared";

const FLOOR_DEPTH = -1000;
const WALL_DEPTH = -900;
const TILE_KEY = "restaurant-tile";
/** The dining area (local px): the wooden floor in the open middle; tiles everywhere else. */
const DINING_RECT = { left: 280, top: 230, right: 860, bottom: 520 };

/** The checkered tile texture (cream + terracotta checker, 80×80), created once; returns its key. */
export function ensureTileTexture(scene: Phaser.Scene): string {
  if (!scene.textures.exists(TILE_KEY)) {
    const g = scene.make.graphics({}, false);
    // Cream and terracotta checker tiles.
    g.fillStyle(0xf1e6d6).fillRect(0, 0, 80, 80);
    g.fillStyle(0xd9a38a).fillRect(0, 0, 40, 40).fillRect(40, 40, 40, 40);
    g.lineStyle(1, 0xb08968, 0.35).strokeRect(0.5, 0.5, 39, 39).strokeRect(40.5, 0.5, 39, 39).strokeRect(0.5, 40.5, 39, 39).strokeRect(40.5, 40.5, 39, 39);
    g.generateTexture(TILE_KEY, 80, 80);
    g.destroy();
  }
  return TILE_KEY;
}

/**
 * The restaurant's interior (static): tile floor all around the edges and the wooden dining room in the
 * open middle, back wall with a tiled splashback along its full width, the sign over the middle and the
 * doormat out to the yard. Stations are drawn by ShopScene like the tea shop's.
 */
export class RestaurantView {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly fs: (px: number) => string,
    floorTexture: string,
  ) {
    ensureTileTexture(scene);
    const R = RESTAURANT;
    scene.add.tileSprite(R.x, R.y, R.width, R.height, TILE_KEY).setOrigin(0).setDepth(FLOOR_DEPTH);
    if (scene.textures.exists(floorTexture)) {
      scene.add
        .tileSprite(
          R.x + DINING_RECT.left,
          R.y + DINING_RECT.top,
          DINING_RECT.right - DINING_RECT.left,
          DINING_RECT.bottom - DINING_RECT.top,
          floorTexture,
        )
        .setOrigin(0)
        .setDepth(FLOOR_DEPTH);
    }
    this.drawWall();
    this.drawExit();
  }

  private drawWall() {
    const R = RESTAURANT;
    const g = this.scene.add.graphics().setDepth(WALL_DEPTH);
    const paperBottom = WALL_BOTTOM - WALL_SKIRTING;
    // Sage wallpaper with thin stripes.
    g.fillStyle(0xcfe0c3).fillRect(R.x, R.y, R.width, paperBottom);
    g.fillStyle(0xc2d6b4);
    for (let x = R.x + 12; x < R.x + R.width; x += 30) g.fillRect(x, R.y, 6, paperBottom);
    // White tiles along the whole back wall.
    g.fillStyle(0xf7f4ee).fillRect(R.x, R.y + 46, R.width, paperBottom - 46);
    g.lineStyle(1, 0xd8d2c8, 0.9);
    for (let y = R.y + 46; y < R.y + paperBottom; y += 12) g.lineBetween(R.x, y, R.x + R.width, y);
    for (let y = R.y + 46, row = 0; y < R.y + paperBottom; y += 12, row++) {
      for (let x = R.x + (row % 2) * 12; x < R.x + R.width; x += 24) g.lineBetween(x, y, x, y + 12);
    }
    // Moulding, skirting board, shadow on the floor.
    g.fillStyle(0x6b8f5e).fillRect(R.x, R.y, R.width, 6);
    g.fillStyle(0x5b3a29).fillRect(R.x, R.y + paperBottom, R.width, WALL_SKIRTING);
    g.fillStyle(0x8d5a3b).fillRect(R.x, R.y + paperBottom, R.width, 3);
    g.fillGradientStyle(0x3d2c29, 0x3d2c29, 0x3d2c29, 0x3d2c29, 0.28, 0.28, 0, 0);
    g.fillRect(R.x, R.y + WALL_BOTTOM, R.width, 12);

    // The sign, centred over the middle of the room.
    const signX = R.x + R.width / 2;
    g.fillStyle(0x3d2c29).fillRoundedRect(signX - 130, R.y + 16, 260, 44, 10);
    g.lineStyle(3, 0xd4a373).strokeRoundedRect(signX - 130, R.y + 16, 260, 44, 10);
    this.scene.add
      .text(signX, R.y + 38, "🍽️ Nhà hàng", { fontFamily: "sans-serif", fontSize: this.fs(22), fontStyle: "bold", color: "#fdf6ec" })
      .setOrigin(0.5)
      .setDepth(WALL_DEPTH + 1);
  }

  /** Doormat on the bottom edge, at the centre of the room: stepping on it goes out to the yard. */
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
