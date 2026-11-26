import Phaser from "phaser";
import { Callbacks, type Room } from "@colyseus/sdk";
import {
  DOCK,
  FISH,
  POND,
  POND_EXIT_ZONE,
  TIER_LABELS,
  WATER,
  getFish,
  rodLineColor,
  type FishTier,
} from "@boba/shared";
import type { BobaShopState, Fish as FishState } from "@boba/shared/schema";

const GROUND_DEPTH = -1000;
const DOCK_DEPTH = -950;
/** Lines + hooks: always readable, above fish and players, below the HUD. */
const LINE_DEPTH = 8000;
/** Decor rooted on the pond's bottom; it stays below the fish (whose depth is their y,
 *  always positive), so no fish is ever hidden by a decoration. */
const DECOR_DEPTH = -990;

/** How a tier of fish looks: display width (rarer fish are bigger). Colour only tints the fallback body. */
const TIER_LOOK: Record<FishTier, { color: number; width: number; height: number }> = {
  common: { color: 0x9aa5b1, width: 26, height: 11 },
  uncommon: { color: 0x7fb069, width: 30, height: 12 },
  rare: { color: 0x9d6b94, width: 34, height: 14 },
  epic: { color: 0xf4a261, width: 40, height: 16 },
  mythic: { color: 0xe9c46a, width: 46, height: 19 },
};

/** Sprites whose art faces LEFT; every other species' art faces right. `update` combines this
 *  with the swim direction to pick the flip, so a left-facing sprite still swims nose-first. */
const FISH_FACING: Record<string, 1 | -1> = {};

/** The pond's decorations, loaded by `preloadPondTextures` (client-only visuals, no interaction). */
const POND_DECOR = [
  "seaweed_green",
  "starfish",
  "shell",
  "crab",
] as const;

const fishTextureKey = (id: string) => `fish_${id}`;
const pondTextureKey = (name: string) => `pond_${name}`;

/** The angler's rod sprite: one art for every level, the line colour differs per level. */
const ROD_TEXTURE = "rod";
/** Rod.png px: the grip held in the angler's hands (bottom-right of the art) = the image's origin. */
const ROD_HANDLE = { x: 130, y: 150 };
/** Rod.png px: the bottom-left end of the baked-in short line (task file, step 1); the coloured
 *  line continues from this point down to the hook. */
const ROD_LINE_ANCHOR = { x: 1, y: 139 };
/** Display scale for the rod sprite so it fits the angler's hands (art is 151x169 px). */
const ROD_SCALE = 0.4;

/** Load every fish sprite, the pond's decoration art and the rod (call from the scene's preload). */
export function preloadPondTextures(scene: Phaser.Scene) {
  for (const f of FISH) scene.load.image(fishTextureKey(f.id), `assets/fish/${f.id}.png`);
  for (const name of POND_DECOR) scene.load.image(pondTextureKey(name), `assets/pond/${name}.png`);
  scene.load.image(ROD_TEXTURE, "assets/rod.png");
}

interface FishView {
  state: FishState;
  container: Phaser.GameObjects.Container;
  /** Interpolated position (the schema updates every FISH_SYNC_SECONDS). */
  x: number;
  y: number;
  /** Which way the sprite's nose points by default (FISH_FACING), combined with the swim direction. */
  facing: 1 | -1;
  /** Display height of the body, for the name label's offset. */
  bodyH: number;
  /** Name label shown above every fish so both players can shout about them. */
  label?: Phaser.GameObjects.Text;
}

/**
 * The fishing pond's interior: water, a wooden dock to walk on, the fish synced in state.fish
 * (sprite art, interpolated smoothly between the schema's 100 ms updates) and every player's
 * hook line. The ground and dock are still code art; the fish and the pond decorations are
 * pixel-art sprites from assets/fish and assets/pond (see the task file).
 */
export class PondView {
  private readonly fishViews = new Map<string, FishView>();
  private readonly lines: Phaser.GameObjects.Graphics;
  /** Rod image per sessionId, out only while that player's hook is sinking or being reeled. */
  private readonly rods = new Map<string, Phaser.GameObjects.Image>();
  private readonly ripples: Phaser.GameObjects.Ellipse[] = [];
  private readonly decor: Phaser.GameObjects.Image[] = [];
  private readonly unsubscribers: (() => void)[] = [];
  private time = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly room: Room<BobaShopState>,
  ) {
    // Pixel-art sprites: nearest-neighbour scaling keeps them crisp (text stays smooth).
    for (const f of FISH) this.scene.textures.get(fishTextureKey(f.id)).setFilter(Phaser.Textures.FilterMode.NEAREST);
    for (const name of POND_DECOR) this.scene.textures.get(pondTextureKey(name)).setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.scene.textures.get(ROD_TEXTURE).setFilter(Phaser.Textures.FilterMode.NEAREST);

    this.drawWater();
    this.drawDock();
    this.lines = this.scene.add.graphics().setDepth(LINE_DEPTH);

    const $ = Callbacks.get(room);
    this.unsubscribers.push(
      $.onAdd("fish", (fish) => {
        const existing = this.fishViews.get(fish.id);
        if (existing) return; // Colyseus may replay the same add on reconnect
        this.fishViews.set(fish.id, this.createFishView(fish));
      }),
      $.onRemove("fish", (fish) => this.removeFishView(fish.id)),
    );
  }

  /** Smooth fish positions towards the schema's and draw everyone's hook lines. */
  update(dt: number) {
    this.time += dt;
    this.updateRipples();

    const k = Math.min(1, dt * 10);
    for (const view of this.fishViews.values()) {
      view.x += (view.state.x - view.x) * k;
      view.y += (view.state.y - view.y) * k;
      view.container.setPosition(view.x, view.y).setDepth(view.y);
      view.container.setScale((view.state.dir >= 0 ? 1 : -1) * view.facing, 1);
      if (view.label) view.label.setPosition(view.x, view.y - view.bodyH - 8);
    }
    this.drawLines();
  }

  destroy() {
    this.unsubscribers.forEach((off) => off());
    for (const view of this.fishViews.values()) {
      view.container.destroy();
      view.label?.destroy();
    }
    this.fishViews.clear();
    this.decor.forEach((img) => img.destroy());
    for (const rod of this.rods.values()) rod.destroy();
    this.rods.clear();
    this.lines.destroy();
    this.ripples.forEach((ripple) => ripple.destroy());
  }

  // ---------------------------------------------------------------- Water, dock and decorations

  private drawWater() {
    const g = this.scene.add.graphics().setDepth(GROUND_DEPTH);
    // Grassy ground strip around the water (the room box).
    g.fillStyle(0x93c56a).fillRect(POND.x, POND.y, POND.width, POND.height);
    // The water itself: darker down the drain.
    g.fillGradientStyle(0x4fa3d1, 0x4fa3d1, 0x1b4965, 0x1b4965, 1).fillRect(WATER.left, WATER.top, WATER.right - WATER.left, WATER.bottom - WATER.top);
    // Sandy edge between the dock and the water.
    g.fillStyle(0xd9c3a0).fillRect(WATER.left - 10, WATER.top - 8, WATER.right - WATER.left + 20, 10);
    // Static ripples (the moving ones are Ellipses, see updateRipples).
    g.lineStyle(2, 0xffffff, 0.25);
    for (let i = 0; i < 8; i++) {
      const x = WATER.left + 40 + ((i * 137) % (WATER.right - WATER.left - 80));
      const y = WATER.top + 30 + ((i * 89) % (WATER.bottom - WATER.top - 60));
      g.strokeEllipse(x, y, 34, 8);
    }
    // The pond's living decorations, drawn on top of the ground art.
    this.drawBottomDecor();

    // Slow-drifting highlight ripples.
    for (let i = 0; i < 4; i++) {
      const ripple = this.scene.add
        .ellipse(WATER.left, WATER.top + 80 + i * 90, 60, 10, 0xffffff, 0.12)
        .setDepth(GROUND_DEPTH + 1);
      this.ripples.push(ripple);
    }
  }

  /** Green seaweed clusters, starfish, shells and a crab rooted along the sandy bottom. */
  private drawBottomDecor() {
    const put = (name: (typeof POND_DECOR)[number], x: number, h: number, flip = false) => {
      const img = this.scene.add
        .image(WATER.left + x, WATER.bottom - 2, pondTextureKey(name))
        .setOrigin(0.5, 1)
        .setDepth(DECOR_DEPTH);
      img.setScale(h / img.height, flip ? -h / img.height : h / img.height);
      this.decor.push(img);
    };
    put("seaweed_green", 60, 56);
    put("seaweed_green", 640, 48, true);
    put("seaweed_green", 860, 50);
    put("starfish", 180, 24);
    put("starfish", 780, 28, true);
    put("shell", 320, 22);
    put("shell", 560, 26);
    put("crab", 380, 30);
  }

  private drawDock() {
    const g = this.scene.add.graphics().setDepth(DOCK_DEPTH);
    const w = DOCK.right - DOCK.left;
    // Planks.
    g.fillStyle(0x9c7457).fillRect(DOCK.left, DOCK.top, w, DOCK.bottom - DOCK.top);
    g.fillStyle(0x8d5a3b);
    for (let y = DOCK.top + 16; y < DOCK.bottom; y += 16) g.fillRect(DOCK.left, y, w, 2);
    for (let x = DOCK.left + 90; x < DOCK.right; x += 140) g.fillRect(x, DOCK.top, 2, DOCK.bottom - DOCK.top);
    g.lineStyle(3, 0x6d4c41).strokeRect(DOCK.left, DOCK.top, w, DOCK.bottom - DOCK.top);
    // Posts sticking into the water.
    for (let x = DOCK.left + 8; x < DOCK.right; x += 120) g.fillStyle(0x6d4c41).fillRect(x, DOCK.bottom, 8, 12);

    // The exit mat at the dock's left end.
    const mat = POND_EXIT_ZONE;
    this.scene.add
      .rectangle((mat.left + mat.right) / 2, (mat.top + mat.bottom) / 2 + 2, mat.right - mat.left, mat.bottom - mat.top - 4, 0x457b9d)
      .setStrokeStyle(2, 0x2c5a77)
      .setDepth(DOCK_DEPTH + 1);
    this.scene.add
      .text(mat.right + 14, (mat.top + mat.bottom) / 2, "⬅ Ra về", {
        fontFamily: "sans-serif",
        fontSize: "13px",
        fontStyle: "bold",
        color: "#fdf6ec",
        backgroundColor: "#3d2c29cc",
        padding: { x: 5, y: 2 },
      })
      .setOrigin(0, 0.5)
      .setDepth(DOCK_DEPTH + 1);
    this.scene.add
      .text((DOCK.left + DOCK.right) / 2, DOCK.top - 8, "Đứng trên bờ · Space: thả câu, giữ để kéo", {
        fontFamily: "sans-serif",
        fontSize: "12px",
        color: "#3d2c29",
        backgroundColor: "#fdf6ecd9",
        padding: { x: 5, y: 2 },
      })
      .setOrigin(0.5)
      .setDepth(DOCK_DEPTH + 1);
  }

  private updateRipples() {
    for (let i = 0; i < this.ripples.length; i++) {
      const ripple = this.ripples[i];
      const span = WATER.right - WATER.left - 80;
      ripple.x = WATER.left + 40 + ((this.time * 18 + i * 220) % span);
    }
  }

  // ---------------------------------------------------------------- Fish (one sprite per schema Fish)

  private createFishView(fish: FishState): FishView {
    const def = getFish(fish.species);
    const tier = def?.tier ?? "common";
    const look = TIER_LOOK[tier];
    const container = this.scene.add.container(fish.x, fish.y);
    let bodyH = look.height;
    const texKey = fishTextureKey(fish.species);
    if (def && this.scene.textures.exists(texKey)) {
      // cut_fish.py already levels the sprite (body horizontal, head right); scale to tier width, aspect kept.
      const body = this.scene.add.image(0, 0, texKey);
      body.setScale(look.width / body.width);
      bodyH = body.displayHeight;
      container.add(body);
    } else {
      // A texture should never be missing (preloadPondTextures loads every FISH); keep a code body.
      const body = this.scene.add.ellipse(0, 0, look.width, look.height, look.color).setStrokeStyle(1, 0x3d2c29, 0.35);
      const tail = this.scene.add.triangle(-look.width / 2 - 2, 0, 0, -look.height / 2, 0, look.height / 2, -10, 0, look.color);
      const fin = this.scene.add.triangle(0, -look.height / 2 - 3, 0, 0, 8, -5, 3, 0, look.color, 0.7);
      const eye = this.scene.add.circle(look.width / 4, -look.height / 6, 2.4, 0xffffff);
      const pupil = this.scene.add.circle(look.width / 4 + 1, -look.height / 6, 1.2, 0x3d2c29);
      container.add([tail, body, fin, eye, pupil]);
    }
    container.setDepth(fish.y);

    // Every fish wears its (small) name so both players see what is in the pond; rare and
    // better also show their tier.
    const rare = tier === "rare" || tier === "epic" || tier === "mythic";
    const name = def?.name ?? fish.species;
    const label = this.scene.add
      .text(0, 0, rare ? `${name} · ${TIER_LABELS[tier]}` : name, {
        fontFamily: "sans-serif",
        fontSize: "9px",
        fontStyle: "bold",
        color: "#3d2c29",
        backgroundColor: "#fdf6eccc",
        padding: { x: 3, y: 1 },
      })
      .setOrigin(0.5)
      .setDepth(LINE_DEPTH - 1);
    return { state: fish, container, x: fish.x, y: fish.y, facing: FISH_FACING[fish.species] ?? 1, bodyH, label };
  }

  private removeFishView(id: string) {
    const view = this.fishViews.get(id);
    if (!view) return;
    view.container.destroy();
    view.label?.destroy();
    this.fishViews.delete(id);
  }

  // ---------------------------------------------------------------- Hook lines (every player with a hook out)

  private drawLines() {
    const g = this.lines;
    g.clear();
    const angling = new Set<string>();
    this.room.state.players.forEach((player, id) => {
      if (player.hookState !== "drop" && player.hookState !== "reel") return;
      angling.add(id);
      // The rod: grip in the angler's hands, art leaning away from them, just under the lines.
      let rod = this.rods.get(id);
      if (!rod) {
        rod = this.scene.add.image(player.x, player.y + 6, ROD_TEXTURE);
        rod.setScale(ROD_SCALE);
        rod.setOrigin(ROD_HANDLE.x / rod.width, ROD_HANDLE.y / rod.height).setDepth(LINE_DEPTH - 1);
        this.rods.set(id, rod);
      }
      rod.setPosition(player.x, player.y + 6);
      // The level-coloured line continues the baked-in short line down to the hook.
      g.lineStyle(2, rodLineColor(player.rodLevel), 0.95).lineBetween(
        player.x + (ROD_LINE_ANCHOR.x - ROD_HANDLE.x) * ROD_SCALE,
        player.y + 6 + (ROD_LINE_ANCHOR.y - ROD_HANDLE.y) * ROD_SCALE,
        player.hookX,
        player.hookY,
      );
      // The hook: a small ring; a fish on it hides the point (it's in its mouth).
      g.lineStyle(2, 0xe63946, 0.95).strokeCircle(player.hookX, player.hookY, 3.5);
    });
    // Rods of players whose hook is gone (or who left the room) come off.
    for (const [id, rod] of this.rods) {
      if (angling.has(id)) continue;
      rod.destroy();
      this.rods.delete(id);
    }
  }

  /** What the e2e hook asks about a player's rod: whether it is held out and its line colour. */
  rodInfo(sessionId: string): { visible: boolean; lineColor: number } | null {
    const player = this.room.state.players.get(sessionId);
    if (!player) return null;
    return { visible: this.rods.has(sessionId), lineColor: rodLineColor(player.rodLevel) };
  }
}
