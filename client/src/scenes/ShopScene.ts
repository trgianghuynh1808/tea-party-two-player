import Phaser from "phaser";
import { Callbacks, type Room } from "@colyseus/sdk";
import {
  DECORATION_CATALOG,
  INTERACT_RANGE,
  ITEM_LABELS,
  Item,
  Messages,
  PLAYER_RADIUS,
  STATIONS,
  ServerEvents,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  directionFromInput,
  distanceToStation,
  stepMovement,
  type Direction,
  type StationDef,
} from "@boba/shared";
import { KeyboardState } from "../input/KeyboardState";

import type { BobaShopState, Decoration, Player } from "@boba/shared/schema";

const PLAYER_COLORS = [0xe76f51, 0x457b9d];
const ITEM_COLORS: Record<string, number> = {
  [Item.Cup]: 0xffffff,
  [Item.CupTea]: 0xc8915a,
  [Item.CupTeaPearl]: 0x8d5b3c,
};

/** Higher = snappier interpolation toward the server position. */
const REMOTE_LERP_RATE = 12;
/** Local prediction is corrected softly when it drifts from the server by more than this. */
const LOCAL_CORRECTION_THRESHOLD = 6;
const LOCAL_SNAP_THRESHOLD = 120;

export interface ShopSceneData {
  room: Room<BobaShopState>;
}

interface PlayerView {
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Arc;
  facing: Phaser.GameObjects.Triangle;
  heldCup: Phaser.GameObjects.Rectangle;
  heldLabel: Phaser.GameObjects.Text;
  // Latest authoritative position from the server.
  serverX: number;
  serverY: number;
  isLocal: boolean;
}

interface StationView {
  def: StationDef;
  rect: Phaser.GameObjects.Rectangle;
  itemCup: Phaser.GameObjects.Rectangle;
  progressBar: Phaser.GameObjects.Rectangle;
  highlight: Phaser.GameObjects.Rectangle;
}

export class ShopScene extends Phaser.Scene {
  private room?: Room<BobaShopState>;
  private players = new Map<string, PlayerView>();
  private stations = new Map<string, StationView>();
  private decorations = new Map<string, Phaser.GameObjects.Container>();

  private keys!: KeyboardState;
  private lastInput = { dx: 0, dy: 0 };
  private localDirection: Direction = "down";

  private moneyText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private toastText!: Phaser.GameObjects.Text;

  constructor() {
    super("ShopScene");
  }

  init(data: ShopSceneData) {
    this.room = data.room;
  }

  create() {
    this.drawFloor();
    this.createStations();
    this.createHud();

    // Use physical key codes so Vietnamese IMEs (Telex: D/W/S...) don't swallow movement keys.
    // Space and arrows are prevented from scrolling the page.
    this.keys = new KeyboardState(["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.keys.destroy());

    if (this.room) this.bindRoom(this.room);
  }

  // ---------------------------------------------------------------- Networking

  private bindRoom(room: Room<BobaShopState>) {
    this.updateStatus();
    const $ = Callbacks.get(room);

    $.onAdd("players", (player, sessionId) => {
      const view = this.createPlayerView(player, sessionId === room.sessionId);
      this.players.set(sessionId, view);
      this.updateStatus();

      $.listen(player, "x", (x) => (view.serverX = x));
      $.listen(player, "y", (y) => (view.serverY = y));
      $.listen(player, "direction", (dir) => {
        if (!view.isLocal) this.applyFacing(view, dir);
      });
      $.listen(player, "heldItem", (item) => this.applyHeldItem(view, item));
    });

    $.onRemove("players", (_player, sessionId) => {
      this.players.get(sessionId)?.container.destroy();
      this.players.delete(sessionId);
      this.updateStatus();
    });

    $.onAdd("stations", (station, id) => {
      const view = this.stations.get(id);
      if (!view) return;
      $.listen(station, "item", (item) => this.applyStationItem(view, item, station.progress));
      $.listen(station, "progress", (p) => this.applyStationItem(view, station.item, p));
    });

    $.listen("money", (money) => this.moneyText.setText(`💰 $${money}`));

    $.onAdd("decorations", (deco) => {
      this.decorations.set(deco.id, this.createDecorationView(deco));
    });
    $.onRemove("decorations", (deco) => {
      this.decorations.get(deco.id)?.destroy();
      this.decorations.delete(deco.id);
    });

    room.onMessage(ServerEvents.Delivered, (msg: { by: string; amount: number }) => {
      const who = msg.by === room.sessionId ? "Bạn" : "Đồng đội";
      this.toast(`${who} giao 1 ly! +$${msg.amount}`, "#2a9d8f");
    });
    room.onMessage(ServerEvents.InteractFailed, (msg: { reason: string }) => {
      this.toast(msg.reason, "#e63946");
    });
  }

  // ---------------------------------------------------------------- Game loop

  update(_time: number, deltaMs: number) {
    const dt = deltaMs / 1000;
    this.handleInput(dt);

    const remoteAlpha = 1 - Math.exp(-REMOTE_LERP_RATE * dt);
    for (const view of this.players.values()) {
      const c = view.container;
      if (view.isLocal) {
        // Local player is predicted in handleInput(); reconcile with server here.
        const err = Phaser.Math.Distance.Between(c.x, c.y, view.serverX, view.serverY);
        if (err > LOCAL_SNAP_THRESHOLD) {
          c.setPosition(view.serverX, view.serverY);
        } else if (err > LOCAL_CORRECTION_THRESHOLD && this.lastInput.dx === 0 && this.lastInput.dy === 0) {
          c.x = Phaser.Math.Linear(c.x, view.serverX, remoteAlpha);
          c.y = Phaser.Math.Linear(c.y, view.serverY, remoteAlpha);
        }
      } else {
        // Remote player: exponential smoothing toward the latest server position.
        c.x = Phaser.Math.Linear(c.x, view.serverX, remoteAlpha);
        c.y = Phaser.Math.Linear(c.y, view.serverY, remoteAlpha);
      }
      c.setDepth(c.y);
    }

    this.updateStationHighlight();
  }

  private handleInput(dt: number) {
    if (!this.room) return;
    const k = this.keys;
    const dx = (k.isDown("KeyD", "ArrowRight") ? 1 : 0) - (k.isDown("KeyA", "ArrowLeft") ? 1 : 0);
    const dy = (k.isDown("KeyS", "ArrowDown") ? 1 : 0) - (k.isDown("KeyW", "ArrowUp") ? 1 : 0);

    // Only send when input changes — the server simulates continuously.
    if (dx !== this.lastInput.dx || dy !== this.lastInput.dy) {
      this.lastInput = { dx, dy };
      this.room.send(Messages.Move, { dx, dy });
    }

    const local = this.players.get(this.room.sessionId);
    if (local && (dx !== 0 || dy !== 0)) {
      const next = stepMovement(local.container, dx, dy, dt);
      local.container.setPosition(next.x, next.y);
      this.localDirection = directionFromInput(dx, dy, this.localDirection);
      this.applyFacing(local, this.localDirection);
    }

    if (k.justPressed("Space")) {
      this.room.send(Messages.Interact);
    }

    if (local) {
      if (k.justPressed("Digit1") || k.justPressed("Numpad1")) this.buyDecoration(0, local);
      if (k.justPressed("Digit2") || k.justPressed("Numpad2")) this.buyDecoration(1, local);
    }
  }

  private buyDecoration(index: number, local: PlayerView) {
    const def = DECORATION_CATALOG[index];
    if (!def || !this.room) return;
    // Place the decoration just below the player.
    this.room.send(Messages.BuyDecoration, {
      kind: def.kind,
      x: local.container.x,
      y: local.container.y + PLAYER_RADIUS + 16,
    });
  }

  // ---------------------------------------------------------------- Views

  private drawFloor() {
    const g = this.add.graphics();
    const tile = 40;
    for (let y = 0; y < WORLD_HEIGHT; y += tile) {
      for (let x = 0; x < WORLD_WIDTH; x += tile) {
        g.fillStyle(((x + y) / tile) % 2 === 0 ? 0xf6efe6 : 0xeee3d3, 1);
        g.fillRect(x, y, tile, tile);
      }
    }
    g.setDepth(-1000);
  }

  private createStations() {
    for (const def of STATIONS) {
      const highlight = this.add
        .rectangle(def.x, def.y, def.width + 12, def.height + 12)
        .setStrokeStyle(3, 0xffd166)
        .setVisible(false);
      const rect = this.add.rectangle(def.x, def.y, def.width, def.height, def.color).setStrokeStyle(2, 0x3d2c29);
      this.add
        .text(def.x, def.y - def.height / 2 - 12, def.label, { fontFamily: "sans-serif", fontSize: "14px", color: "#3d2c29" })
        .setOrigin(0.5);
      const itemCup = this.add.rectangle(def.x, def.y, 18, 24, 0xffffff).setStrokeStyle(2, 0x3d2c29).setVisible(false);
      const progressBar = this.add
        .rectangle(def.x - def.width / 2 + 6, def.y + def.height / 2 - 8, 0, 6, 0x2a9d8f)
        .setOrigin(0, 0.5);

      for (const o of [highlight, rect, itemCup, progressBar]) o.setDepth(def.y + def.height / 2);
      this.stations.set(def.id, { def, rect, itemCup, progressBar, highlight });
    }
  }

  private createHud() {
    this.moneyText = this.add
      .text(16, 12, "💰 $0", { fontFamily: "sans-serif", fontSize: "22px", color: "#3d2c29", fontStyle: "bold" })
      .setDepth(10000);
    this.statusText = this.add
      .text(16, WORLD_HEIGHT - 52, "Đang kết nối...", { fontFamily: "sans-serif", fontSize: "14px", color: "#3d2c29" })
      .setDepth(10000);
    this.add
      .text(
        16,
        WORLD_HEIGHT - 28,
        "WASD/mũi tên: di chuyển · Space: tương tác · 1: mua chậu cây ($50) · 2: mua đèn lồng ($75)",
        { fontFamily: "sans-serif", fontSize: "13px", color: "#6b5b57" },
      )
      .setDepth(10000);
    this.toastText = this.add
      .text(WORLD_WIDTH / 2, 20, "", { fontFamily: "sans-serif", fontSize: "18px", color: "#2a9d8f", fontStyle: "bold" })
      .setOrigin(0.5, 0)
      .setDepth(10000)
      .setAlpha(0);
  }

  private createPlayerView(state: Player, isLocal: boolean): PlayerView {
    const color = PLAYER_COLORS[state.colorIndex % PLAYER_COLORS.length];
    const body = this.add.circle(0, 0, PLAYER_RADIUS, color).setStrokeStyle(3, isLocal ? 0xffd166 : 0x3d2c29);
    const facing = this.add.triangle(0, 0, 0, -6, 12, 0, 0, 6, 0x3d2c29);
    const name = this.add
      .text(0, -PLAYER_RADIUS - 14, isLocal ? "Bạn" : "P2", { fontFamily: "sans-serif", fontSize: "12px", color: "#3d2c29" })
      .setOrigin(0.5);
    const heldCup = this.add.rectangle(0, -PLAYER_RADIUS - 34, 16, 20, 0xffffff).setStrokeStyle(2, 0x3d2c29).setVisible(false);
    const heldLabel = this.add
      .text(0, -PLAYER_RADIUS - 52, "", { fontFamily: "sans-serif", fontSize: "11px", color: "#3d2c29", backgroundColor: "#ffffffcc" })
      .setOrigin(0.5)
      .setVisible(false);

    const container = this.add.container(state.x, state.y, [body, facing, name, heldCup, heldLabel]);
    const view: PlayerView = { container, body, facing, heldCup, heldLabel, serverX: state.x, serverY: state.y, isLocal };
    this.applyFacing(view, state.direction);
    this.applyHeldItem(view, state.heldItem);
    return view;
  }

  private applyFacing(view: PlayerView, dir: string) {
    const offsets: Record<string, [number, number, number]> = {
      right: [PLAYER_RADIUS - 4, 0, 0],
      left: [-(PLAYER_RADIUS - 4), 0, Math.PI],
      down: [0, PLAYER_RADIUS - 4, Math.PI / 2],
      up: [0, -(PLAYER_RADIUS - 4), -Math.PI / 2],
    };
    const [x, y, rot] = offsets[dir] ?? offsets.down;
    view.facing.setPosition(x, y).setRotation(rot);
  }

  private applyHeldItem(view: PlayerView, item: string) {
    const has = item !== Item.None;
    view.heldCup.setVisible(has);
    view.heldLabel.setVisible(has);
    if (has) {
      view.heldCup.setFillStyle(ITEM_COLORS[item] ?? 0xffffff);
      view.heldLabel.setText(ITEM_LABELS[item] ?? item);
    }
  }

  private applyStationItem(view: StationView, item: string, progress: number) {
    view.itemCup.setVisible(item !== Item.None);
    if (item !== Item.None) view.itemCup.setFillStyle(ITEM_COLORS[item] ?? 0xffffff);
    const showProgress = progress > 0 && progress < 1;
    view.progressBar.width = showProgress ? (view.def.width - 12) * progress : 0;
  }

  private createDecorationView(deco: Decoration) {
    const def = DECORATION_CATALOG.find((d) => d.kind === deco.kind);
    const color = def?.color ?? 0x999999;
    const shape =
      deco.kind === "lamp"
        ? this.add.circle(0, 0, 12, color).setStrokeStyle(2, 0x3d2c29)
        : this.add.rectangle(0, 0, 22, 22, color).setStrokeStyle(2, 0x3d2c29);
    const label = this.add
      .text(0, 18, def?.label ?? deco.kind, { fontFamily: "sans-serif", fontSize: "10px", color: "#3d2c29" })
      .setOrigin(0.5);
    return this.add.container(deco.x, deco.y, [shape, label]).setDepth(deco.y);
  }

  private updateStationHighlight() {
    const local = this.room ? this.players.get(this.room.sessionId) : undefined;
    let nearestId: string | undefined;
    if (local) {
      let best = INTERACT_RANGE;
      for (const def of STATIONS) {
        const d = distanceToStation(local.container, def);
        if (d <= best) {
          best = d;
          nearestId = def.id;
        }
      }
    }
    for (const [id, view] of this.stations) view.highlight.setVisible(id === nearestId);
  }

  private updateStatus() {
    if (!this.room) return;
    const count = this.players.size;
    this.statusText.setText(
      count >= 2
        ? "Đủ 2 người, cùng làm trà sữa nào!"
        : `Chờ người chơi thứ 2... Gửi mã phòng ${this.room.roomId} cho bạn của bạn`,
    );
  }

  private toast(message: string, color: string) {
    this.tweens.killTweensOf(this.toastText);
    this.toastText.setText(message).setColor(color).setAlpha(1);
    this.tweens.add({ targets: this.toastText, alpha: 0, delay: 1200, duration: 400 });
  }
}
