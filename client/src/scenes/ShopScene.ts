import Phaser from "phaser";
import { Callbacks, type Room } from "@colyseus/sdk";
import {
  EMPTY_HAND,
  CHARACTERS,
  GamePhase,
  StationType,
  Messages,
  POSITION_SEND_INTERVAL_MS,
  STATIONS,
  ServerEvents,
  WALL_BOTTOM,
  WALL_SKIRTING,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  directionFromInput,
  inRect,
  isInYard,
  SHOP_ENTER_ZONE,
  SHOP_EXIT_ZONE,
  YARD,
  findInteractTarget,
  footprintBox,
  pendingDrinksAt,
  planInteraction,
  planServeTable,
  tablesWaiting,
  stepMovement,
  describeItem,
  pendingOrderDrinkIds,
  comboBonusRate,
  type DeliveredEvent,
  type MachineOverflowEvent,
  type OrderExpiredEvent,
  type CharacterDef,
  type Direction,
  type StationDef,
} from "@boba/shared";
import { KeyboardState } from "../input/KeyboardState";
import { TouchControls, isTouchDevice } from "../input/TouchControls";
import { DECOR_ROTATE, PALETTE_DRAG_START, type PaletteDragStart } from "../ui/DecorPanel";
import { CupView, preloadCupTextures } from "./CupView";
import { DecorController, preloadDecorTextures } from "./DecorController";
import { CustomerController } from "./CustomerController";
import { YardView, preloadBuildTextures } from "./YardView";
import { BuildController } from "./BuildController";
import { CHARACTER_BODY_PX, DIRECTION_ROW, FEET_Y, HEAD_Y, WALK_COLUMNS, WALK_FPS, characterKey, characterOf } from "./characterArt";

import type { BobaShopState, Player } from "@boba/shared/schema";

const PLAYER_COLORS = [0xe76f51, 0x457b9d];

/** Phones render the 960×600 world at ~0.6× scale, so in-game text is enlarged on touch devices. */
const FONT_SCALE = isTouchDevice() ? 1.3 : 1;
const fs = (px: number) => `${Math.round(px * FONT_SCALE)}px`;

/** game.events event from the DOM 🪑 button: payload = true (enter decorate mode) / false (leave). */
export const DECORATE_MODE_EVENT = "decorate-mode";
/** game.events event from the DOM 🔨 button: payload = true (enter build mode) / false (leave). */
export const BUILD_MODE_EVENT = "build-mode";
/** game.events event from the build panel: payload = tool (tile kind or ERASE_TOOL). */
export const BUILD_TOOL_EVENT = "build-tool";
/** game.events event from the scene: payload = true when the local player is in the yard, false inside the shop. */
export const AREA_EVENT = "area-changed";
/** Don't send UseDoor again while waiting for the server's teleport. */
const DOOR_RESEND_MS = 700;

/**
 * Remote players are drawn this far in the past so there are always two snapshots to interpolate between,
 * which hides uneven packet arrival on high-latency connections.
 */
const REMOTE_INTERP_DELAY_MS = 120;

export interface ShopSceneData {
  room: Room<BobaShopState>;
}

interface PositionSample {
  t: number;
  x: number;
  y: number;
}

interface PlayerView {
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Sprite;
  heldCup: CupView;
  heldLabel: Phaser.GameObjects.Text;
  nameLabel: Phaser.GameObjects.Text;
  // Remote players: timestamped server positions for buffered interpolation.
  samples: PositionSample[];
  // Last Player.teleportSeq applied to this view (a change means "snap, don't interpolate").
  teleportSeq: number;
  isLocal: boolean;
  character: CharacterDef;
  direction: string;
  // Walk animation: frame cycle for multi-frame sheets, a small hop for single-frame ones.
  lastX: number;
  lastY: number;
  walkPhase: number;
}


/**
 * Stations drawn with an image instead of a coloured rectangle (client/public/assets/stations/).
 * The image is scaled to the station height and centred, keeping its aspect ratio.
 */
const STATION_TEXTURES: Partial<Record<string, string>> = {
  cup_shelf: "assets/stations/cup_shelf.png",
  black_tea: "assets/stations/black_tea.png",
  green_tea: "assets/stations/green_tea.png",
  milk: "assets/stations/milk.png",
  pearl: "assets/stations/pearl.png",
  cheese_foam: "assets/stations/cheese_foam.png",
  passion: "assets/stations/passion.png",
  trash: "assets/stations/trash.png",
};
/**
 * Counters are drawn as 9-slice images so any station size keeps crisp corners and the same
 * front-face thickness: only the flat table top in the middle is stretched.
 * Insets are in source pixels; SLICE_SCALE maps source pixels to screen pixels.
 */
const SLICE_SCALE = 58 / 123; // a 58 px table shows the small counter art at its natural height
/**
 * Look of the counters. "art" = checkered tablecloth images, "counter" = the previous wooden counters (9-slice).
 * Switch back by setting a style to "counter" (all images are kept in assets/stations/).
 */
const COUNTER_STYLE = "art" as "art" | "counter"; // "Bàn": round checkered tables
const DELIVERY_STYLE = "art" as "art" | "counter"; // "Giao hàng": checkered market stall
/**
 * Checkered art drawn to fit the station box (aspect kept). `topCentre` = where cups stand on the table top,
 * as a fraction of the image height.
 */
const FITTED_ART: Partial<Record<StationType, { url: string; topCentre: number }>> = {
  ...(COUNTER_STYLE === "art" && { [StationType.Counter]: { url: "assets/stations/table_checkered.png", topCentre: 0.25 } }),
  ...(DELIVERY_STYLE === "art" && { [StationType.DeliveryCounter]: { url: "assets/stations/stall_checkered.png", topCentre: 0.45 } }),
};
const fittedArtKey = (type: string) => `station-art-${type}`;

const SLICED_STATIONS: Partial<Record<StationType, { url: string; left: number; right: number; top: number; bottom: number }>> = {
  ...(COUNTER_STYLE === "counter" && {
    [StationType.Counter]: { url: "assets/stations/counter.png", left: 12, right: 12, top: 12, bottom: 37 },
  }),
  ...(DELIVERY_STYLE === "counter" && {
    [StationType.DeliveryCounter]: { url: "assets/stations/counter_long.png", left: 12, right: 16, top: 12, bottom: 35 },
  }),
};
const slicedTextureKey = (type: string) => `station-sliced-${type}`;


/** Ingredient icons drawn on top of a station so it reads at a glance (height in screen px). */
const STATION_ICONS: Partial<Record<string, { url: string; height: number }>> = {
  cup_shelf: { url: "assets/cups/empty.png", height: 40 },
  black_tea: { url: "assets/items/icons/tea_leaves.png", height: 36 },
  milk: { url: "assets/items/icons/milk_carton.png", height: 42 },
  green_tea: { url: "assets/items/icons/tea_leaves.png", height: 36 },
  pearl: { url: "assets/items/icons/coffee_beans.png", height: 36 },
  cheese_foam: { url: "assets/items/icons/whipped_cream.png", height: 36 },
  passion: { url: "assets/items/icons/passion_seeds.png", height: 32 },
};
const stationIconKey = (id: string) => `station-icon-${id}`;

const FLOOR_TEXTURE = "floor-wood";

/** Back wall look (drawn, no texture): striped wallpaper, crown moulding, skirting board, shadow on the floor. */
const WALL_DEPTH = -900; // above the floor, below wall art (DecorController) and everything on the floor
const WALL = {
  paper: 0xf6e7d2,
  stripe: 0xefdcc2,
  stripeWidth: 14,
  stripeGap: 34,
  moulding: 0xb98b64,
  mouldingHeight: 5,
  skirting: 0x9c7457,
  skirtingTop: 0xc29a78,
  shadowHeight: 12,
};

/** On-screen cup heights: sitting on a station / carried above the head. */
const STATION_CUP_HEIGHT = 32;
const HELD_CUP_HEIGHT = 26;
/** Progress bar inset from the station's visible edges (images have a thicker dark border). */
const BAR_INSET = { rect: { x: 6, bottom: 8 }, image: { x: 9, bottom: 11 } };
const stationTextureKey = (id: string) => `station-${id}`;

interface StationView {
  def: StationDef;
  rect: Phaser.GameObjects.Rectangle | Phaser.GameObjects.Image | Phaser.GameObjects.NineSlice;
  itemCup: CupView;
  progressBar: Phaser.GameObjects.Rectangle;
  /** Progress bar length at 100%: fits inside the visible station (an image may be narrower than def.width). */
  progressMaxWidth: number;
  highlight: Phaser.GameObjects.Rectangle;
  readyLabel: Phaser.GameObjects.Text;
}

export class ShopScene extends Phaser.Scene {
  private room?: Room<BobaShopState>;
  private players = new Map<string, PlayerView>();
  private stations = new Map<string, StationView>();
  private decor?: DecorController;
  private customers?: CustomerController;
  private yard?: YardView;
  private build?: BuildController;
  /** Area the camera currently shows (undefined until the local player exists). */
  private inYard?: boolean;
  private lastDoorAt = 0;
  /** Walls in the yard for movement prediction (same rule as the server). */
  private readonly tiles = { get: (key: string) => this.room?.state.tiles?.get(key) };
  /** Outline around the table the action key would serve. */
  private tableHighlight!: Phaser.GameObjects.Rectangle;

  private keys!: KeyboardState;
  private touch?: TouchControls;
  private actionHint!: Phaser.GameObjects.Text;
  private lastActionKey = "";
  private lastSent = { x: NaN, y: NaN, direction: "", at: 0 };
  private localDirection: Direction = "down";

  private moneyText!: Phaser.GameObjects.Text;
  private shiftText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private toastText!: Phaser.GameObjects.Text;

  constructor() {
    super("ShopScene");
  }

  preload() {
    for (const c of CHARACTERS) {
      this.load.spritesheet(characterKey(c.id), c.sheet, { frameWidth: c.frameWidth, frameHeight: c.frameHeight });
    }
    for (const [id, url] of Object.entries(STATION_TEXTURES)) {
      if (url) this.load.image(stationTextureKey(id), url);
    }
    for (const [type, art] of Object.entries(FITTED_ART)) {
      if (art) this.load.image(fittedArtKey(type), art.url);
    }
    for (const [type, slice] of Object.entries(SLICED_STATIONS)) {
      if (slice) this.load.image(slicedTextureKey(type), slice.url);
    }
    for (const [id, icon] of Object.entries(STATION_ICONS)) {
      if (icon) this.load.image(stationIconKey(id), icon.url);
    }
    this.load.image(FLOOR_TEXTURE, "assets/floor/wood.jpg");
    preloadCupTextures(this);
    preloadDecorTextures(this);
    preloadBuildTextures(this);
  }

  init(data: ShopSceneData) {
    this.room = data.room;
  }

  create() {
    // Pixel-art sprites: nearest-neighbour scaling for these textures only (text stays smooth).
    for (const c of CHARACTERS) this.textures.get(characterKey(c.id)).setFilter(Phaser.Textures.FilterMode.NEAREST);

    this.drawFloor();
    this.drawWall();
    this.drawExit();
    this.createStations();
    this.createHud();
    this.tableHighlight = this.add.rectangle(0, 0, 1, 1).setStrokeStyle(3, 0xffd166).setVisible(false);

    // Use physical key codes so Vietnamese IMEs (Telex: D/W/S...) don't swallow movement keys.
    // Space and arrows are prevented from scrolling the page.
    this.keys = new KeyboardState(["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
    if (isTouchDevice()) {
      this.touch = new TouchControls(this);
      this.actionHint.setVisible(false); // the action button shows the label instead
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.touch?.destroy());

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.keys.destroy());

    // Decorate mode is toggled from the DOM (🪑 button); catalog drags start in the DOM panel.
    const onDecorateMode = (enabled: boolean) => {
      this.decor?.setEnabled(enabled);
      this.touch?.setEnabled(!enabled); // joystick would fight with dragging furniture
    };
    const onPaletteDrag = (e: PaletteDragStart) => this.decor?.startPaletteDrag(e);
    const onRotate = () => this.decor?.rotate();
    const onBuildMode = (enabled: boolean) => {
      this.build?.setEnabled(enabled);
      this.touch?.setEnabled(!enabled); // dragging builds instead of steering
    };
    const onBuildTool = (tool: string) => this.build?.setTool(tool);
    this.game.events.on(DECORATE_MODE_EVENT, onDecorateMode);
    this.game.events.on(PALETTE_DRAG_START, onPaletteDrag);
    this.game.events.on(DECOR_ROTATE, onRotate);
    this.game.events.on(BUILD_MODE_EVENT, onBuildMode);
    this.game.events.on(BUILD_TOOL_EVENT, onBuildTool);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(DECORATE_MODE_EVENT, onDecorateMode);
      this.game.events.off(PALETTE_DRAG_START, onPaletteDrag);
      this.game.events.off(DECOR_ROTATE, onRotate);
      this.game.events.off(BUILD_MODE_EVENT, onBuildMode);
      this.game.events.off(BUILD_TOOL_EVENT, onBuildTool);
      this.decor?.destroy();
      this.customers?.destroy();
      this.yard?.destroy();
      this.build?.destroy();
    });

    if (this.room) this.bindRoom(this.room);
  }

  // ---------------------------------------------------------------- Networking

  private bindRoom(room: Room<BobaShopState>) {
    this.updateStatus();
    const $ = Callbacks.get(room);

    // The yard outside the shop and building on it.
    this.yard = new YardView(this, room);
    this.build = new BuildController(this, room);

    $.onAdd("players", (player, sessionId) => {
      const view = this.createPlayerView(player, sessionId === room.sessionId);
      this.players.set(sessionId, view);
      // The camera follows us around the yard (inside the shop it can't scroll: the bounds equal the view).
      if (view.isLocal) this.cameras.main.startFollow(view.container, true);
      this.updateStatus();

      $.onChange(player, () => this.onPlayerChanged(view, player));
      $.listen(player, "direction", (dir) => {
        if (!view.isLocal) this.applyFacing(view, dir);
      });
      $.listen(player, "heldItem", (item) => this.applyHeldItem(view, item));
      $.listen(player, "name", () => this.applyName(view, player));
      $.listen(player, "online", () => this.applyName(view, player));
      // HUD: my own wallet (shift earnings are split between players when the shift ends).
      if (view.isLocal) $.listen(player, "money", (money) => this.moneyText.setText(`💰 $${money}`));
    });

    $.onRemove("players", (_player, sessionId) => {
      this.players.get(sessionId)?.container.destroy();
      this.players.delete(sessionId);
      this.updateStatus();
    });

    $.onAdd("stations", (station, id) => {
      const view = this.stations.get(id);
      if (!view) return;
      const apply = () => this.applyStationItem(view, station.item, station.progress, station.overflow);
      $.listen(station, "item", apply);
      $.listen(station, "progress", apply);
      $.listen(station, "overflow", apply);
    });

    $.listen("phase", () => this.updateShiftText(room.state));
    $.listen("shiftTimeLeft", () => this.updateShiftText(room.state));
    $.listen("combo", () => this.updateShiftText(room.state));

    const decor = new DecorController(this, room, fs);
    this.decor = decor;
    $.onAdd("decorations", (deco) => {
      decor.add(deco);
      $.listen(deco, "x", () => decor.syncPosition(deco.id));
      $.listen(deco, "y", () => decor.syncPosition(deco.id));
      $.listen(deco, "rotation", () => decor.syncRotation(deco.id));
    });
    $.onRemove("decorations", (deco) => decor.remove(deco.id));

    // Customers sitting at the tables (take-away orders are only shown in the orders panel).
    const customers = new CustomerController(this, room);
    this.customers = customers;
    $.onAdd("orders", (order) => {
      customers.addOrder(order);
      $.listen(order, "servedMask", () => customers.syncServed(order.id));
    });
    $.onRemove("orders", (order) => customers.removeOrder(order.id));

    room.onMessage(ServerEvents.Delivered, (msg: DeliveredEvent) => {
      // Arrives before the order's removal: the last servedMask change of a removed order isn't synced.
      if (msg.served >= msg.total) this.customers?.markServed(msg.orderId);
      const who = msg.by === room.sessionId ? "Bạn" : room.state.players.get(msg.by)?.name || "Đồng đội";
      if (msg.served < msg.total) {
        this.toast(`${who} giao ${msg.drinkName} (${msg.served}/${msg.total}) · nhóm khách chờ đủ món`, "#2a9d8f");
        return;
      }
      const notes = msg.notes.length ? ` (${msg.notes.join(", ")})` : "";
      this.toast(`${who} giao ${msg.drinkName}! +$${msg.amount}${notes}`, "#2a9d8f");
    });
    room.onMessage(ServerEvents.OrderExpired, (msg: OrderExpiredEvent) => {
      this.toast(`Khách bỏ về (${msg.label}) −$${msg.penalty} · mất combo`, "#e76f51");
    });
    room.onMessage(ServerEvents.MachineOverflow, (msg: MachineOverflowEvent) => {
      this.toast(`Máy ${msg.machine} bị tràn, mất ly!`, "#e63946");
    });
    room.onMessage(ServerEvents.InteractFailed, (msg: { reason: string }) => {
      this.toast(msg.reason, "#e63946");
    });
  }

  // ---------------------------------------------------------------- Game loop

  update(_time: number, deltaMs: number) {
    const dt = deltaMs / 1000;
    this.handleInput(dt);

    const renderAt = performance.now() - REMOTE_INTERP_DELAY_MS;
    for (const view of this.players.values()) {
      const c = view.container;
      // Local player is moved directly in handleInput(); remote players follow the snapshot buffer.
      if (!view.isLocal) this.interpolateRemote(view, renderAt);
      c.setDepth(c.y);
      this.animateWalk(view, dt);
    }
    this.customers?.update(dt);
    this.updateArea();

    this.updateStationHighlight();
  }

  private handleInput(dt: number) {
    if (!this.room) return;
    const k = this.keys;
    let dx = (k.isDown("KeyD", "ArrowRight") ? 1 : 0) - (k.isDown("KeyA", "ArrowLeft") ? 1 : 0);
    let dy = (k.isDown("KeyS", "ArrowDown") ? 1 : 0) - (k.isDown("KeyW", "ArrowUp") ? 1 : 0);
    // Touch joystick is used when the keyboard isn't steering.
    if (this.touch && dx === 0 && dy === 0) {
      dx = this.touch.dx;
      dy = this.touch.dy;
    }

    const local = this.players.get(this.room.sessionId);
    if (local) {
      const moving = dx !== 0 || dy !== 0;
      if (moving) {
        const next = stepMovement(local.container, dx, dy, dt, this.tiles);
        local.container.setPosition(next.x, next.y);
        this.localDirection = directionFromInput(dx, dy, this.localDirection);
        this.applyFacing(local, this.localDirection);
      }
      this.sendPosition(local, moving);
      this.checkDoor(local);
    }

    // Always consume both so a stale tap doesn't fire later.
    const pressedSpace = k.justPressed("Space");
    const tappedAction = this.touch?.consumeAction() ?? false;
    if (pressedSpace || tappedAction) {
      this.room.send(Messages.Interact);
    }
  }

  /** Standing on the doormat (outside) or at the exit (inside): ask the server to go through the door. */
  private checkDoor(local: PlayerView) {
    const pos = local.container;
    const zone = isInYard(pos) ? SHOP_ENTER_ZONE : SHOP_EXIT_ZONE;
    const now = performance.now();
    if (!inRect(pos, zone) || now - this.lastDoorAt < DOOR_RESEND_MS) return;
    this.lastDoorAt = now;
    this.room!.send(Messages.UseDoor);
  }

  /** Point the camera at the area the local player is in (shop: fixed view; yard: scrolls with the player). */
  private updateArea() {
    const local = this.room ? this.players.get(this.room.sessionId) : undefined;
    if (!local) return;
    const inYard = isInYard(local.container);
    if (inYard === this.inYard) return;
    this.inYard = inYard;
    const cam = this.cameras.main;
    if (inYard) cam.setBounds(YARD.x, YARD.y, YARD.width, YARD.height);
    else cam.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    cam.centerOn(local.container.x, local.container.y);
    this.lastActionKey = ""; // refresh the action hint
    this.game.events.emit(AREA_EVENT, inYard);
  }

  // ---------------------------------------------------------------- Views

  /** Wood floor art, pre-cropped to the world size (client/assets-src/floor/build_floor.py). */
  private drawFloor() {
    this.add.image(0, 0, FLOOR_TEXTURE).setOrigin(0).setDisplaySize(WORLD_WIDTH, WORLD_HEIGHT).setDepth(-1000);
  }

  /** Back wall strip at the top of the shop (y 0..WALL_BOTTOM): paintings hang on it, machines stand against it. */
  private drawWall() {
    const g = this.add.graphics().setDepth(WALL_DEPTH);
    const paperBottom = WALL_BOTTOM - WALL_SKIRTING;
    g.fillStyle(WALL.paper).fillRect(0, 0, WORLD_WIDTH, paperBottom);
    g.fillStyle(WALL.stripe);
    for (let x = WALL.stripeGap / 2; x < WORLD_WIDTH; x += WALL.stripeGap) g.fillRect(x, 0, WALL.stripeWidth, paperBottom);
    g.fillStyle(WALL.moulding).fillRect(0, 0, WORLD_WIDTH, WALL.mouldingHeight);
    g.fillStyle(WALL.skirting).fillRect(0, paperBottom, WORLD_WIDTH, WALL_SKIRTING);
    g.fillStyle(WALL.skirtingTop).fillRect(0, paperBottom, WORLD_WIDTH, 3);
    // Soft contact shadow where the wall meets the floor.
    g.fillGradientStyle(0x3d2c29, 0x3d2c29, 0x3d2c29, 0x3d2c29, 0.28, 0.28, 0, 0);
    g.fillRect(0, WALL_BOTTOM, WORLD_WIDTH, WALL.shadowHeight);
  }

  /** Doormat at the bottom of the shop floor: stepping on it goes out to the yard. */
  private drawExit() {
    const z = SHOP_EXIT_ZONE;
    const cx = (z.left + z.right) / 2;
    this.add.rectangle(cx, WORLD_HEIGHT - 10, z.right - z.left, 20, 0xe76f51).setStrokeStyle(2, 0x9a4432).setDepth(-890);
    this.add
      .text(cx, WORLD_HEIGHT - 10, "⬇ Ra sân", { fontFamily: "sans-serif", fontSize: fs(11), fontStyle: "bold", color: "#fdf6ec" })
      .setOrigin(0.5)
      .setDepth(-889);
  }

  private createStations() {
    for (const def of STATIONS) {
      const highlight = this.add
        .rectangle(def.x, def.y, def.width + 12, def.height + 12)
        .setStrokeStyle(3, 0xffd166)
        .setVisible(false);
      const rect = this.createStationBody(def);
      const iconDef = STATION_ICONS[def.id];
      if (iconDef) {
        // Sits on the station, under any cup placed there (same depth, created earlier).
        const icon = this.add.image(def.x, def.y, stationIconKey(def.id));
        icon.setScale(iconDef.height / icon.height).setDepth(def.y + def.height / 2);
      }
      // Phones: icon only, the seconds would make neighbouring labels overlap at the larger font size.
      const timed = def.processSeconds ? (FONT_SCALE > 1 ? " ⏱" : ` ⏱${def.processSeconds}s`) : "";
      this.add
        .text(def.x, def.y - def.height / 2 - 10, def.label + timed, {
          fontFamily: "sans-serif",
          fontSize: fs(12),
          color: "#3d2c29",
          fontStyle: "bold",
          // Machine labels sit on the skirting board: a light tag keeps them readable.
          backgroundColor: "#fdf6ecd9",
          padding: { x: 3, y: 1 },
        })
        .setOrigin(0.5)
        .setDepth(def.y + def.height / 2 + 1);
      // Cups stand on the table top, not on the counter's front face.
      const slice = SLICED_STATIONS[def.type];
      const topSurfaceBottom = slice
        ? def.y + def.height / 2 - slice.bottom * SLICE_SCALE
        : FITTED_ART[def.type]
          ? def.y - def.height / 2 + def.height * FITTED_ART[def.type]!.topCentre + 8
          : Infinity;
      const itemCup = new CupView(this, def.x, Math.min(def.y + STATION_CUP_HEIGHT / 2, topSurfaceBottom), STATION_CUP_HEIGHT);
      const inset = rect instanceof Phaser.GameObjects.Image ? BAR_INSET.image : BAR_INSET.rect;
      const visibleWidth = rect.displayWidth;
      const progressMaxWidth = visibleWidth - inset.x * 2;
      const progressBar = this.add
        .rectangle(def.x - visibleWidth / 2 + inset.x, def.y + def.height / 2 - inset.bottom, 0, 6, 0x2a9d8f)
        .setOrigin(0, 0.5);
      const readyLabel = this.add
        .text(def.x, def.y + def.height / 2 + 10, "Xong! Space để lấy", {
          fontFamily: "sans-serif",
          fontSize: fs(11),
          color: "#ffffff",
          backgroundColor: "#2a9d8f",
          padding: { x: 4, y: 1 },
        })
        .setOrigin(0.5)
        .setVisible(false);

      for (const o of [highlight, rect, itemCup, progressBar]) o.setDepth(def.y + def.height / 2);
      readyLabel.setDepth(9000); // above players standing in front of the machine
      this.stations.set(def.id, { def, rect, itemCup, progressBar, progressMaxWidth, highlight, readyLabel });
    }
  }

  /** Station artwork: 9-slice counter, plain image, or a coloured rectangle as fallback. */
  private createStationBody(def: StationDef) {
    if (FITTED_ART[def.type]) {
      const img = this.add.image(def.x, def.y, fittedArtKey(def.type));
      return img.setScale(Math.min(def.width / img.width, def.height / img.height));
    }
    const slice = SLICED_STATIONS[def.type];
    if (slice) {
      return this.add
        .nineslice(def.x, def.y, slicedTextureKey(def.type), undefined, def.width / SLICE_SCALE, def.height / SLICE_SCALE, slice.left, slice.right, slice.top, slice.bottom)
        .setScale(SLICE_SCALE);
    }
    const key = stationTextureKey(def.id);
    if (STATION_TEXTURES[def.id]) return this.add.image(def.x, def.y, key).setScale(def.height / this.textures.getFrame(key).height);
    return this.add.rectangle(def.x, def.y, def.width, def.height, def.color).setStrokeStyle(2, 0x3d2c29);
  }

  private createHud() {
    this.moneyText = this.add
      .text(16, 12, "💰 $0", { fontFamily: "sans-serif", fontSize: "22px", color: "#3d2c29", fontStyle: "bold" })
      .setDepth(10000).setScrollFactor(0);
    this.statusText = this.add
      .text(16, WORLD_HEIGHT - 52, "Đang kết nối...", { fontFamily: "sans-serif", fontSize: fs(14), color: "#3d2c29" })
      .setDepth(10000).setScrollFactor(0);
    this.add
      .text(
        16,
        WORLD_HEIGHT - 28,
        isTouchDevice()
          ? "Chạm nửa trái để di chuyển · nút tròn bên phải để tương tác"
          : "WASD/mũi tên: đi · Space: tương tác · thảm đỏ: ra sân",
        { fontFamily: "sans-serif", fontSize: fs(13), color: "#6b5b57" },
      )
      .setDepth(10000).setScrollFactor(0);
    // Desktop: previews what Space does at the highlighted station.
    this.actionHint = this.add
      .text(WORLD_WIDTH - 16, WORLD_HEIGHT - 84, "", {
        fontFamily: "sans-serif",
        fontSize: fs(15),
        fontStyle: "bold",
        color: "#2a9d8f",
        backgroundColor: "#f6efe6dd",
        padding: { x: 6, y: 2 },
      })
      .setOrigin(1, 0)
      .setDepth(10000).setScrollFactor(0);
    this.shiftText = this.add
      .text(WORLD_WIDTH - 16, 12, "", { fontFamily: "sans-serif", fontSize: "22px", color: "#3d2c29", fontStyle: "bold" })
      .setOrigin(1, 0)
      .setDepth(10000).setScrollFactor(0);
    this.toastText = this.add
      .text(WORLD_WIDTH / 2, 20, "", { fontFamily: "sans-serif", fontSize: fs(18), color: "#2a9d8f", fontStyle: "bold" })
      .setOrigin(0.5, 0)
      .setDepth(10000).setScrollFactor(0)
      .setAlpha(0);
  }

  private createPlayerView(state: Player, isLocal: boolean): PlayerView {
    // Colored ring at the feet tells the two players apart (both may pick the same character).
    const color = PLAYER_COLORS[state.colorIndex % PLAYER_COLORS.length];
    const shadow = this.add
      .ellipse(0, FEET_Y, 44, 16, color, 0.45)
      .setStrokeStyle(isLocal ? 3 : 2, isLocal ? 0xffd166 : color, 1);
    const character = characterOf(state.character);
    const sprite = this.add
      .sprite(0, FEET_Y, characterKey(character.id), character.standColumn)
      .setOrigin(0.5, character.feetRow / character.frameHeight)
      .setScale(CHARACTER_BODY_PX / character.bodyHeight);
    const name = this.add
      .text(0, HEAD_Y - 8, "", {
        fontFamily: "sans-serif",
        fontSize: fs(12),
        fontStyle: "bold",
        color: isLocal ? "#3d2c29" : "#457b9d",
      })
      .setOrigin(0.5);
    const heldCup = new CupView(this, 0, HEAD_Y - 18, HELD_CUP_HEIGHT);
    const heldLabel = this.add
      .text(0, HEAD_Y - 62, "", { fontFamily: "sans-serif", fontSize: fs(11), color: "#3d2c29", backgroundColor: "#ffffffcc" })
      .setOrigin(0.5)
      .setVisible(false);

    const container = this.add.container(state.x, state.y, [shadow, sprite, name, heldCup, heldLabel]);
    const view: PlayerView = {
      container,
      sprite,
      heldCup,
      heldLabel,
      nameLabel: name,
      samples: [{ t: performance.now(), x: state.x, y: state.y }],
      teleportSeq: state.teleportSeq,
      isLocal,
      lastX: state.x,
      lastY: state.y,
      walkPhase: 0,
      character,
      direction: "down",
    };
    this.applyFacing(view, state.direction);
    this.applyHeldItem(view, state.heldItem);
    this.applyName(view, state);
    return view;
  }

  /** Username over the head; a player who lost connection is faded out until they come back. */
  private applyName(view: PlayerView, state: Player) {
    const name = state.name || (view.isLocal ? "Bạn" : "P2");
    view.nameLabel.setText(state.online ? name : `💤 ${name}`);
    view.container.setAlpha(state.online ? 1 : 0.45);
  }

  private applyFacing(view: PlayerView, dir: string) {
    view.direction = dir;
    this.setCharacterFrame(view, view.character.standColumn);
  }

  /** Show `column` of the row for the view's current direction. */
  private setCharacterFrame(view: PlayerView, column: number) {
    const { columns } = view.character;
    view.sprite.setFrame((DIRECTION_ROW[view.direction] ?? DIRECTION_ROW.down) * columns + column);
  }

  /** Report the local position: throttled while moving, immediately once stopped so the final spot is exact. */
  private sendPosition(local: PlayerView, moving: boolean) {
    const { x, y } = local.container;
    const last = this.lastSent;
    if (x === last.x && y === last.y && this.localDirection === last.direction) return;
    const now = performance.now();
    if (moving && now - last.at < POSITION_SEND_INTERVAL_MS) return;
    this.room!.send(Messages.Position, { x, y, direction: this.localDirection, teleportSeq: local.teleportSeq });
    this.lastSent = { x, y, direction: this.localDirection, at: now };
  }

  private onPlayerChanged(view: PlayerView, player: Player) {
    const teleported = player.teleportSeq !== view.teleportSeq;
    view.teleportSeq = player.teleportSeq;
    if (view.isLocal) {
      // The server only touches our position when teleporting (shift start, rejected move).
      if (teleported) view.container.setPosition(player.x, player.y);
      return;
    }
    const now = performance.now();
    if (teleported) {
      view.samples = [{ t: now, x: player.x, y: player.y }];
      view.container.setPosition(player.x, player.y);
      return;
    }
    const last = view.samples[view.samples.length - 1];
    if (!last || last.x !== player.x || last.y !== player.y) view.samples.push({ t: now, x: player.x, y: player.y });
  }

  private interpolateRemote(view: PlayerView, renderAt: number) {
    const samples = view.samples;
    // Drop snapshots that are fully behind the render time, keeping one to interpolate from.
    while (samples.length >= 2 && samples[1].t <= renderAt) samples.shift();
    const a = samples[0];
    if (!a) return;
    const b = samples[1];
    if (!b || renderAt <= a.t) {
      view.container.setPosition(a.x, a.y);
      return;
    }
    const k = (renderAt - a.t) / (b.t - a.t);
    view.container.setPosition(Phaser.Math.Linear(a.x, b.x, k), Phaser.Math.Linear(a.y, b.y, k));
  }

  private animateWalk(view: PlayerView, dt: number) {
    const { x, y } = view.container;
    const moving = Math.hypot(x - view.lastX, y - view.lastY) > 0.3;
    view.lastX = x;
    view.lastY = y;
    view.walkPhase = moving ? view.walkPhase + dt : 0;
    if (view.character.columns > 1) {
      // Real walk cycle from the sheet.
      const column = moving ? WALK_COLUMNS[Math.floor(view.walkPhase * WALK_FPS) % WALK_COLUMNS.length] : view.character.standColumn;
      this.setCharacterFrame(view, column);
    } else {
      // One pose per direction: fake the steps with a small hop.
      view.sprite.y = FEET_Y - (moving ? Math.abs(Math.sin(view.walkPhase * 14)) * 4 : 0);
    }
  }

  private applyHeldItem(view: PlayerView, item: string) {
    const has = item !== EMPTY_HAND;
    view.heldCup.setItem(item);
    view.heldLabel.setVisible(has);
    if (has) view.heldLabel.setText(describeItem(item));
  }

  private updateShiftText(state: BobaShopState) {
    if (state.phase === GamePhase.Playing) {
      const t = Math.ceil(state.shiftTimeLeft);
      const mmss = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
      const rate = comboBonusRate(state.combo);
      const combo = state.combo >= 2 ? `  🔥x${state.combo}${rate > 0 ? ` +${Math.round(rate * 100)}%` : ""}` : "";
      this.shiftText.setText(`⏱ ${mmss}${combo}`).setColor(t <= 30 ? "#e63946" : "#3d2c29");
    } else {
      this.shiftText.setText(state.phase === GamePhase.Ended ? "Hết ca" : "Chưa mở ca").setColor("#6b5b57");
    }
  }

  private applyStationItem(view: StationView, item: string, progress: number, overflow: number) {
    view.itemCup.setItem(item);
    const showProgress = progress > 0 && progress < 1;
    // Ready cup on a machine: the bar turns red and shrinks until the cup spills.
    const spilling = item !== EMPTY_HAND && progress >= 1 && overflow > 0;
    view.progressBar.width = showProgress
      ? view.progressMaxWidth * progress
      : spilling
        ? view.progressMaxWidth * (1 - overflow)
        : 0;
    view.progressBar.setFillStyle(spilling ? 0xe63946 : 0x2a9d8f);
    if (view.def.type === StationType.Counter) {
      // Counters: show what's on it so the teammate knows what to pick up.
      view.readyLabel.setVisible(item !== EMPTY_HAND);
      if (item !== EMPTY_HAND) view.readyLabel.setText(describeItem(item)).setBackgroundColor("#6d4c41");
      return;
    }
    // Timed machines: cup finished and waiting to be picked up.
    view.readyLabel.setVisible(view.def.type === StationType.Machine && item !== EMPTY_HAND && progress >= 1);
    // It spills if left too long (see MACHINE_OVERFLOW_SECONDS).
    if (overflow >= 0.5) view.readyLabel.setText("⚠ Sắp tràn! Lấy ngay").setBackgroundColor("#e63946");
    else view.readyLabel.setText("Xong! Space để lấy").setBackgroundColor("#2a9d8f");
  }

  /** Highlight the nearest station (or table with waiting customers) and preview what the action key/button would do there. */
  private updateStationHighlight() {
    const room = this.room;
    const local = room ? this.players.get(room.sessionId) : undefined;
    // The first state patch may not have arrived yet during the first frames.
    const state = room?.state;
    const tables = state?.orders && state.decorations ? tablesWaiting(state.decorations, state.orders) : [];
    const target = local ? findInteractTarget(local.container, tables) : undefined;
    const def = target?.type === "station" ? target.def : undefined;
    for (const [id, view] of this.stations) view.highlight.setVisible(id === def?.id);
    const tableBox = target?.type === "table" ? footprintBox(target.table) : undefined;
    this.tableHighlight.setVisible(!!tableBox);
    if (tableBox) {
      // The table art rises above its footprint: outline the whole piece.
      const top = tableBox.bottom - 52;
      this.tableHighlight
        .setPosition((tableBox.left + tableBox.right) / 2, (top + tableBox.bottom) / 2)
        .setSize(tableBox.right - tableBox.left + 12, tableBox.bottom - top + 8)
        .setDepth(tableBox.bottom);
      this.tableHighlight.updateDisplayOrigin();
    }

    let label: string | null = null;
    let reason = "";
    const player = state?.players?.get(room!.sessionId);
    const station = def && state?.stations?.get(def.id);
    if (room && state?.orders && player && target?.type === "table") {
      const plan = planServeTable({ phase: state.phase, held: player.heldItem, orderedDrinkIds: pendingDrinksAt(state.orders, target.table.id) });
      if (plan.ok) label = plan.label;
      else reason = plan.reason;
    } else if (room && state?.orders && def && station && player) {
      const plan = planInteraction(def, {
        phase: state.phase,
        held: player.heldItem,
        stationItem: station.item,
        stationProgress: station.progress,
        orderedDrinkIds: pendingDrinksAt(state.orders, ""),
        seatedDrinkIds: pendingOrderDrinkIds(state.orders),
      });
      if (plan.ok) label = plan.label;
      else reason = plan.reason;
    }

    // Only touch the game objects when the preview actually changes.
    const key = `${label}|${reason}`;
    if (key === this.lastActionKey) return;
    this.lastActionKey = key;

    this.touch?.setAction(label);
    if (label) this.actionHint.setText(`[Space] ${label}`).setColor("#2a9d8f");
    else this.actionHint.setText(reason).setColor("#8a7a76");
    this.actionHint.setVisible(!this.touch && this.actionHint.text !== "");
  }

  private updateStatus() {
    if (!this.room) return;
    const count = this.players.size;
    this.statusText.setText(
      count >= 2
        ? "Đủ 2 người, cùng làm trà sữa nào!"
        : "Chờ người chơi thứ 2... Bấm 🔗 Mời để gửi link vào thẳng phòng này",
    );
  }

  private toast(message: string, color: string) {
    this.tweens.killTweensOf(this.toastText);
    this.toastText.setText(message).setColor(color).setAlpha(1);
    this.tweens.add({ targets: this.toastText, alpha: 0, delay: 1200, duration: 400 });
  }
}
