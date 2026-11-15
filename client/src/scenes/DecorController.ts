import Phaser from "phaser";
import type { Room } from "@colyseus/sdk";
import {
  DECOR_GRID,
  Messages,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  canPlaceDecoration,
  getDecorationDef,
  snapToGrid,
  type DecorationDef,
} from "@boba/shared";
import type { BobaShopState, Decoration } from "@boba/shared/schema";
import type { PaletteDragStart } from "../ui/DecorPanel";

const OK_COLOR = 0x2a9d8f;
const BAD_COLOR = 0xe63946;
const FLOOR_DEPTH = -500; // rugs: above the floor tiles, below everything else
const UI_DEPTH = 15000;
/** Decorate-mode overlay: a light veil over the floor with a cell grid so positions are easy to read. */
const PLACE_TOP = 40; // furniture can't go above this (HUD / machine labels)
const GRID_CELL = DECOR_GRID * 4;
const VEIL_ALPHA = 0.35;
const GRID_LINE_ALPHA = 0.35;

interface DecorView {
  state: Decoration;
  def: DecorationDef;
  container: Phaser.GameObjects.Container;
  outline: Phaser.GameObjects.Rectangle;
}

/**
 * Furniture in the shop: renders synced decorations and, in "decorate mode", lets the player
 * - drag catalog items from the DOM panel into the shop (buy + place),
 * - drag placed furniture to move it, or onto the 🗑 zone to sell it.
 * Placement is previewed with shared rules (canPlaceDecoration); the server re-validates.
 */
export class DecorController {
  private views = new Map<string, DecorView>();
  private enabled = false;
  private draggingId: string | null = null;
  private dragStart = { x: 0, y: 0 };
  private readonly grid: Phaser.GameObjects.Graphics;
  /** Floor area the dragged piece would cover (green = OK, red = blocked). */
  private readonly footprint: Phaser.GameObjects.Rectangle;
  private readonly sellZone: Phaser.GameObjects.Container;
  private readonly sellZoneBg: Phaser.GameObjects.Rectangle;
  private ghost?: { def: DecorationDef; view: Phaser.GameObjects.Container; outline: Phaser.GameObjects.Rectangle };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly room: Room<BobaShopState>,
    private readonly fontSize: (px: number) => string,
  ) {
    // Above the floor and rugs, below stations, furniture and players.
    this.grid = scene.add.graphics().setDepth(FLOOR_DEPTH + 1).setVisible(false);
    this.grid.fillStyle(0xffffff, VEIL_ALPHA).fillRect(0, PLACE_TOP, WORLD_WIDTH, WORLD_HEIGHT - PLACE_TOP);
    this.grid.lineStyle(1, 0x3d2c29, GRID_LINE_ALPHA);
    for (let x = 0; x <= WORLD_WIDTH; x += GRID_CELL) this.grid.lineBetween(x, PLACE_TOP, x, WORLD_HEIGHT);
    for (let y = PLACE_TOP; y <= WORLD_HEIGHT; y += GRID_CELL) this.grid.lineBetween(0, y, WORLD_WIDTH, y);
    this.footprint = scene.add.rectangle(0, 0, 1, 1, OK_COLOR, 0.3).setDepth(FLOOR_DEPTH + 2).setVisible(false);

    this.sellZoneBg = scene.add.rectangle(0, 0, 260, 56, 0xe63946, 0.18).setStrokeStyle(3, BAD_COLOR, 0.7);
    const sellText = scene.add
      .text(0, 0, "🗑 Thả vào đây để bán", { fontFamily: "sans-serif", fontSize: fontSize(15), fontStyle: "bold", color: "#b3261e" })
      .setOrigin(0.5);
    this.sellZone = scene.add
      .container(WORLD_WIDTH / 2, WORLD_HEIGHT - 40, [this.sellZoneBg, sellText])
      .setDepth(UI_DEPTH)
      .setVisible(false);

    scene.input.on(Phaser.Input.Events.DRAG_START, this.onDragStart, this);
    scene.input.on(Phaser.Input.Events.DRAG, this.onDrag, this);
    scene.input.on(Phaser.Input.Events.DRAG_END, this.onDragEnd, this);
  }

  get isEnabled() {
    return this.enabled;
  }

  /** Called when a decoration is added to the synced state. */
  add(state: Decoration) {
    const def = getDecorationDef(state.kind);
    if (!def) return;
    const shape =
      def.shape === "circle"
        ? this.scene.add.circle(0, 0, def.width / 2, def.color)
        : this.scene.add.rectangle(0, 0, def.width, def.height, def.color);
    shape.setStrokeStyle(2, 0x3d2c29, def.layer === "floor" ? 0.35 : 1);
    if (def.layer === "floor") shape.setAlpha(0.75);

    const outline = this.scene.add
      .rectangle(0, 0, def.width + 6, def.height + 6)
      .setStrokeStyle(3, OK_COLOR)
      .setVisible(false);
    const children: Phaser.GameObjects.GameObject[] = [shape, outline];
    if (def.layer === "object") {
      children.push(
        this.scene.add
          .text(0, def.height / 2 + 8, def.label, { fontFamily: "sans-serif", fontSize: this.fontSize(10), color: "#3d2c29" })
          .setOrigin(0.5),
      );
    }

    const container = this.scene.add.container(state.x, state.y, children).setSize(def.width, def.height);
    const view: DecorView = { state, def, container, outline };
    this.views.set(state.id, view);
    this.applyDepth(view);
    this.setDraggable(view, this.enabled);
  }

  /** Synced position changed (moved by us or the other player). */
  syncPosition(id: string) {
    const view = this.views.get(id);
    if (!view || this.draggingId === id) return;
    view.container.setPosition(view.state.x, view.state.y);
    this.applyDepth(view);
  }

  remove(id: string) {
    this.views.get(id)?.container.destroy();
    this.views.delete(id);
  }

  /** Turn decorate mode on/off: grid, draggable furniture. */
  setEnabled(enabled: boolean) {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    this.grid.setVisible(enabled);
    for (const view of this.views.values()) this.setDraggable(view, enabled);
    if (!enabled) {
      this.cancelGhost();
      this.footprint.setVisible(false);
      this.sellZone.setVisible(false);
    }
  }

  destroy() {
    this.scene.input.off(Phaser.Input.Events.DRAG_START, this.onDragStart, this);
    this.scene.input.off(Phaser.Input.Events.DRAG, this.onDrag, this);
    this.scene.input.off(Phaser.Input.Events.DRAG_END, this.onDragEnd, this);
    this.cancelGhost();
  }

  // ---------------------------------------------------------------- Dragging placed furniture (Phaser input)

  private setDraggable(view: DecorView, draggable: boolean) {
    if (draggable) {
      view.container.setInteractive({ draggable: true, useHandCursor: true });
    } else {
      view.container.disableInteractive();
      view.outline.setVisible(false);
    }
  }

  private viewOf(obj: Phaser.GameObjects.GameObject) {
    for (const [id, view] of this.views) if (view.container === obj) return { id, view };
    return undefined;
  }

  private onDragStart(_pointer: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject) {
    const hit = this.viewOf(obj);
    if (!hit || !this.enabled) return;
    this.draggingId = hit.id;
    this.dragStart = { x: hit.view.container.x, y: hit.view.container.y };
    hit.view.container.setDepth(UI_DEPTH - 1);
    this.sellZone.setVisible(true);
  }

  private onDrag(pointer: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject, dragX: number, dragY: number) {
    const hit = this.viewOf(obj);
    if (!hit || this.draggingId !== hit.id) return;
    const x = snapToGrid(dragX);
    const y = snapToGrid(dragY);
    hit.view.container.setPosition(x, y);

    const overSell = this.isOverSellZone(pointer.worldX, pointer.worldY);
    const ok = overSell || canPlaceDecoration(hit.view.def.kind, x, y, this.placed(), hit.id);
    hit.view.outline.setVisible(true).setStrokeStyle(3, ok ? OK_COLOR : BAD_COLOR);
    this.showFootprint(hit.view.def, x, y, ok, !overSell);
    this.sellZoneBg.setFillStyle(BAD_COLOR, overSell ? 0.4 : 0.18);
  }

  private onDragEnd(pointer: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject) {
    const hit = this.viewOf(obj);
    if (!hit || this.draggingId !== hit.id) return;
    const { id, view } = hit;
    this.draggingId = null;
    this.sellZone.setVisible(false);
    view.outline.setVisible(false);
    this.footprint.setVisible(false);

    if (this.isOverSellZone(pointer.worldX, pointer.worldY)) {
      this.room.send(Messages.SellDecoration, { id });
      return;
    }

    const { x, y } = view.container;
    const moved = x !== this.dragStart.x || y !== this.dragStart.y;
    if (moved && canPlaceDecoration(view.def.kind, x, y, this.placed(), id)) {
      this.room.send(Messages.MoveDecoration, { id, x, y });
      // If the server rejects it, the synced position won't change: snap back to it shortly after.
      this.scene.time.delayedCall(600, () => this.syncPosition(id));
    } else {
      view.container.setPosition(this.dragStart.x, this.dragStart.y);
    }
    this.applyDepth(view);
  }

  private isOverSellZone(x: number, y: number) {
    const z = this.sellZone;
    return Math.abs(x - z.x) <= this.sellZoneBg.width / 2 && Math.abs(y - z.y) <= this.sellZoneBg.height / 2;
  }

  // ---------------------------------------------------------------- Dragging a new item in from the DOM panel

  /**
   * The press started on a DOM element outside the canvas, so Phaser doesn't track it:
   * follow the pointer with window events and convert client coords to world coords ourselves.
   */
  startPaletteDrag(event: PaletteDragStart) {
    const def = getDecorationDef(event.kind);
    if (!def || !this.enabled) return;
    this.cancelGhost();

    const shape =
      def.shape === "circle"
        ? this.scene.add.circle(0, 0, def.width / 2, def.color, 0.75)
        : this.scene.add.rectangle(0, 0, def.width, def.height, def.color, 0.75);
    const outline = this.scene.add.rectangle(0, 0, def.width + 6, def.height + 6).setStrokeStyle(3, BAD_COLOR);
    const view = this.scene.add.container(-1000, -1000, [shape, outline]).setDepth(UI_DEPTH).setVisible(false);
    this.ghost = { def, view, outline };

    const move = (e: PointerEvent) => {
      if (e.pointerId !== event.pointerId) return;
      this.updateGhost(e.clientX, e.clientY);
    };
    const end = (e: PointerEvent) => {
      if (e.pointerId !== event.pointerId) return;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      const target = e.type === "pointerup" ? this.ghostTarget(e.clientX, e.clientY) : undefined;
      if (target?.ok) this.room.send(Messages.BuyDecoration, { kind: def.kind, x: target.x, y: target.y });
      this.cancelGhost();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    this.updateGhost(event.clientX, event.clientY);
  }

  private ghostTarget(clientX: number, clientY: number) {
    if (!this.ghost) return undefined;
    const rect = this.scene.game.canvas.getBoundingClientRect();
    const inside = clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
    if (!inside) return undefined;
    const x = snapToGrid(((clientX - rect.left) / rect.width) * WORLD_WIDTH);
    const y = snapToGrid(((clientY - rect.top) / rect.height) * WORLD_HEIGHT);
    return { x, y, ok: canPlaceDecoration(this.ghost.def.kind, x, y, this.placed()) };
  }

  private updateGhost(clientX: number, clientY: number) {
    if (!this.ghost) return;
    const target = this.ghostTarget(clientX, clientY);
    this.ghost.view.setVisible(!!target);
    if (!target) return this.footprint.setVisible(false);
    this.ghost.view.setPosition(target.x, target.y);
    this.ghost.outline.setStrokeStyle(3, target.ok ? OK_COLOR : BAD_COLOR);
    this.showFootprint(this.ghost.def, target.x, target.y, target.ok);
  }

  private cancelGhost() {
    this.ghost?.view.destroy();
    this.ghost = undefined;
    this.footprint?.setVisible(false);
  }

  // ---------------------------------------------------------------- Helpers

  /** Shade the floor under the piece being placed so its exact cells are visible. */
  private showFootprint(def: DecorationDef, x: number, y: number, ok: boolean, visible = true) {
    this.footprint
      .setVisible(visible)
      .setPosition(x, y)
      .setSize(def.width, def.height)
      .setFillStyle(ok ? OK_COLOR : BAD_COLOR, 0.3);
    this.footprint.setOrigin(0.5); // keep it centred on (x, y) after resizing
  }

  /** Current furniture positions as the client sees them (used for placement preview). */
  private placed() {
    return [...this.views.entries()].map(([id, v]) => ({ id, kind: v.def.kind, x: v.state.x, y: v.state.y }));
  }

  private applyDepth(view: DecorView) {
    view.container.setDepth(view.def.layer === "floor" ? FLOOR_DEPTH : view.container.y);
  }
}
