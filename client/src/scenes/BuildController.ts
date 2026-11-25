import Phaser from "phaser";
import type { Room } from "@colyseus/sdk";
import {
  BUILD_TILE,
  ERASE_TOOL,
  Messages,
  SHOP_LOT,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  YARD,
  YARD_COLS,
  YARD_ROWS,
  buildRefund,
  buildRotationCount,
  cellAt,
  cellRect,
  cellsForTool,
  getBuildTile,
  normalizeTileRotation,
  planCellChange,
  planTileMove,
  propAnchor,
  tileKey,
  type BuildTilesMessage,
} from "@boba/shared";
import type { BobaShopState } from "@boba/shared/schema";
import { propTexture } from "./YardView";
import { isScreenUi } from "../input/TouchControls";

const UI_DEPTH = 15000;
const OK_COLOR = 0x2a9d8f;
const ERASE_COLOR = 0xe63946;
const SELECT_COLOR = 0xffd166;
/** If the server rejects a move/turn, the synced state doesn't change: re-sync to it after this long. */
const RESYNC_MS = 600;

/** A placed prop the host selected (no tool picked), like furniture in decorate mode. */
interface SelectedProp {
  cx: number;
  cy: number;
  /** Structure-layer key of its cell. */
  key: string;
  kind: string;
  rotation: number;
}

/**
 * Build mode in the yard (anyone, paid from their own wallet; guests on empty cells only): pick a tool in the
 * DOM panel, then drag over the land. Floors / the eraser fill the dragged rectangle, walls and fences draw
 * its outline, a door goes on one cell. The hover preview only shows with a tool picked; R turns a prop tool's ghost.
 * With no tool picked, the host works like decorate mode: tap a placed prop to select it, drag it to move
 * (or onto the 🗑 zone to sell), R / ⟳ to turn it, Delete to sell, Esc or an empty cell to deselect.
 * The preview shows the affected cells and the price; the server re-checks and applies it.
 */
export class BuildController {
  private enabled = false;
  private tool = "";
  /** Which way a prop placed with the current tool faces (R turns the ghost). */
  private ghostRotation = 0;
  private dragStart?: { cx: number; cy: number };
  private dragPointerId = -1;
  /** Dragging the selected prop (no tool picked). */
  private dragProp?: { pointerId: number };
  private selected?: SelectedProp;
  /** Cell the pointer last hovered (redrawn after a ghost turn). */
  private hoverCell?: { cx: number; cy: number };
  private readonly grid: Phaser.GameObjects.Graphics;
  private readonly preview: Phaser.GameObjects.Graphics;
  private readonly costLabel: Phaser.GameObjects.Text;
  /** Props: see-through preview of the object where it would stand. */
  private readonly ghost: Phaser.GameObjects.Image;
  /** Highlight around the selected prop's cell. */
  private readonly selection: Phaser.GameObjects.Rectangle;
  private readonly sellZone: Phaser.GameObjects.Container;
  private readonly sellZoneBg: Phaser.GameObjects.Rectangle;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly room: Room<BobaShopState>,
  ) {
    this.grid = scene.add.graphics().setDepth(-850).setVisible(false);
    this.drawGrid();
    this.preview = scene.add.graphics().setDepth(UI_DEPTH - 2);
    this.costLabel = scene.add
      .text(0, 0, "", { fontFamily: "sans-serif", fontSize: "14px", fontStyle: "bold", color: "#ffffff", padding: { x: 5, y: 2 } })
      .setOrigin(0, 1)
      .setDepth(UI_DEPTH - 1)
      .setVisible(false);
    this.ghost = scene.add.image(0, 0, "__DEFAULT").setOrigin(0.5, 1).setAlpha(0.65).setDepth(UI_DEPTH - 3).setVisible(false);
    this.selection = scene.add.rectangle(0, 0, 1, 1).setStrokeStyle(3, SELECT_COLOR).setOrigin(0).setDepth(UI_DEPTH - 2).setVisible(false);

    this.sellZoneBg = scene.add.rectangle(0, 0, 260, 56, ERASE_COLOR, 0.18).setStrokeStyle(3, ERASE_COLOR, 0.7);
    const sellText = scene.add
      .text(0, 0, "🗑 Thả vào đây để bán", { fontFamily: "sans-serif", fontSize: "15px", fontStyle: "bold", color: "#b3261e" })
      .setOrigin(0.5);
    // Fixed on screen (the yard's camera scrolls): hit-tested with screen coordinates.
    this.sellZone = scene.add
      .container(WORLD_WIDTH / 2, WORLD_HEIGHT - 40, [this.sellZoneBg, sellText])
      .setDepth(UI_DEPTH)
      .setScrollFactor(0, 0, true)
      .setVisible(false);

    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onMove, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    window.addEventListener("keydown", this.onKeyDown);
  }

  /** `showGrid`: keep the cell grid on while input is paused (phones walking around in build mode). */
  setEnabled(enabled: boolean, showGrid = enabled) {
    this.enabled = enabled;
    this.grid.setVisible(showGrid);
    this.dragStart = undefined;
    this.cancelPropDrag();
    this.select(undefined);
    this.clearPreview();
  }

  setTool(tool: string) {
    this.tool = tool;
    this.ghostRotation = 0;
    this.hoverCell = undefined;
    this.cancelPropDrag();
    this.select(undefined);
    this.clearPreview();
  }

  destroy() {
    this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.onMove, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    window.removeEventListener("keydown", this.onKeyDown);
  }

  private onDown(pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[] = []) {
    if (!this.enabled || this.dragStart || this.dragProp || isScreenUi(over)) return;
    const cell = cellAt(pointer.worldX, pointer.worldY);
    if (cell.cx < 0 || cell.cy < 0 || cell.cx >= YARD_COLS || cell.cy >= YARD_ROWS) return;
    if (this.tool) {
      this.dragStart = cell;
      this.dragPointerId = pointer.id;
      this.showPreview(cell, cell);
      return;
    }
    // No tool picked: pick up a placed prop (host only, like decorate mode).
    if (!this.isHost()) return;
    const hit = this.propAt(cell);
    if (!hit) return this.select(undefined); // empty cell: deselect
    this.select(hit);
    this.dragProp = { pointerId: pointer.id };
    this.sellZone.setVisible(true);
    this.previewPropDrag(pointer);
  }

  private onMove(pointer: Phaser.Input.Pointer) {
    if (!this.enabled) return;
    const cell = cellAt(pointer.worldX, pointer.worldY);
    if (this.dragStart) {
      if (pointer.id === this.dragPointerId) this.showPreview(this.dragStart, cell);
    } else if (this.dragProp) {
      if (pointer.id === this.dragProp.pointerId) this.previewPropDrag(pointer);
    } else if (this.tool && !pointer.isDown) {
      // Hover (with a tool picked): show what a single click would do.
      this.hoverCell = cell;
      this.showPreview(cell, cell);
    }
  }

  private onUp(pointer: Phaser.Input.Pointer) {
    if (this.dragStart && pointer.id === this.dragPointerId) {
      const end = cellAt(pointer.worldX, pointer.worldY);
      const start = this.dragStart;
      this.dragStart = undefined;
      this.clearPreview();
      if (!cellsForTool(this.tool, start.cx, start.cy, end.cx, end.cy).length) return;
      const msg: BuildTilesMessage = { tool: this.tool, x0: start.cx, y0: start.cy, x1: end.cx, y1: end.cy, rotation: this.ghostRotation };
      this.room.send(Messages.BuildTiles, msg);
      return;
    }
    if (!this.dragProp || pointer.id !== this.dragProp.pointerId) return;
    this.dragProp = undefined;
    this.sellZone.setVisible(false);
    this.clearPreview();
    const selected = this.selected;
    if (!selected) return;
    if (this.isOverSellZone(pointer.x, pointer.y)) {
      this.room.send(Messages.SellTile, { cx: selected.cx, cy: selected.cy });
      this.select(undefined);
      return;
    }
    const cell = cellAt(pointer.worldX, pointer.worldY);
    const plan = planTileMove(this.room.state.tiles ?? new Map(), selected.key, cell.cx, cell.cy);
    if (!plan || plan.rotateOnly) return; // dropped on itself / an invalid cell: keep the selection
    this.room.send(Messages.MoveTile, { cx: selected.cx, cy: selected.cy, toCx: cell.cx, toCy: cell.cy });
    // Optimistic: stay selected at the target cell until the server confirms (or rejects) the move.
    this.select({ cx: cell.cx, cy: cell.cy, key: plan.to, kind: plan.kind, rotation: selected.rotation });
    this.scene.time.delayedCall(RESYNC_MS, () => this.syncSelected());
  }

  /** Highlight the cells the drag would change and show the price (or the refund). */
  private showPreview(from: { cx: number; cy: number }, to: { cx: number; cy: number }) {
    const g = this.preview.clear();
    this.ghost.setVisible(false);
    const erase = this.tool === ERASE_TOOL;
    const def = getBuildTile(this.tool);
    const tiles = this.room.state.tiles;
    let cost = 0;
    let count = 0;
    for (const { cx, cy } of cellsForTool(this.tool, from.cx, from.cy, to.cx, to.cy)) {
      const change = tiles && planCellChange(tiles, this.tool, cx, cy, !this.isHost());
      if (!change) continue;
      const oldDef = getBuildTile(change.old);
      cost += (def?.price ?? 0) - (oldDef ? buildRefund(oldDef) : 0);
      count++;
      const r = cellRect(cx, cy);
      g.fillStyle(erase ? ERASE_COLOR : OK_COLOR, 0.35).fillRect(r.left, r.top, BUILD_TILE, BUILD_TILE);
      g.lineStyle(1, erase ? ERASE_COLOR : OK_COLOR, 0.9).strokeRect(r.left + 0.5, r.top + 0.5, BUILD_TILE - 1, BUILD_TILE - 1);
    }
    if (!count) {
      // Nothing to do here (shop lot, outside, or already built): outline the hovered cell in red.
      const r = cellRect(to.cx, to.cy);
      g.lineStyle(2, ERASE_COLOR, 0.8).strokeRect(r.left, r.top, BUILD_TILE, BUILD_TILE);
      this.costLabel.setVisible(false);
      return;
    }
    const tex = def?.shape === "prop" ? propTexture(this.scene, def, this.ghostRotation) : undefined;
    if (tex) {
      const at = propAnchor(to.cx, to.cy);
      this.ghost.setTexture(tex.key).setScale(tex.scale).setPosition(at.x, at.y + 2).setVisible(true);
    }
    const r = cellRect(to.cx, to.cy);
    const text = cost >= 0 ? `${count} ô · $${cost}` : `${count} ô · hoàn $${-cost}`;
    this.costLabel
      .setText(text)
      .setBackgroundColor(cost > 0 && cost > this.money() ? "#e63946" : "#3d2c29")
      .setPosition(r.right + 4, r.top)
      .setVisible(true);
  }

  /** Ghost + target-cell highlight while dragging the selected prop (no tool picked). */
  private previewPropDrag(pointer: Phaser.Input.Pointer) {
    const selected = this.selected;
    if (!selected) return;
    const def = getBuildTile(selected.kind);
    if (!def) return;
    const cell = cellAt(pointer.worldX, pointer.worldY);
    const inside = cell.cx >= 0 && cell.cy >= 0 && cell.cx < YARD_COLS && cell.cy < YARD_ROWS;
    const plan = inside ? planTileMove(this.room.state.tiles ?? new Map(), selected.key, cell.cx, cell.cy) : undefined;
    const overSell = this.isOverSellZone(pointer.x, pointer.y);
    const ok = overSell || !!plan;
    const g = this.preview.clear();
    if (inside) {
      const r = cellRect(cell.cx, cell.cy);
      g.fillStyle(ok ? OK_COLOR : ERASE_COLOR, 0.35).fillRect(r.left, r.top, BUILD_TILE, BUILD_TILE);
      g.lineStyle(2, ok ? OK_COLOR : ERASE_COLOR, 0.9).strokeRect(r.left + 0.5, r.top + 0.5, BUILD_TILE - 1, BUILD_TILE - 1);
    }
    if (overSell || inside) {
      const tex = propTexture(this.scene, def, selected.rotation);
      if (tex) {
        const at = propAnchor(cell.cx, cell.cy);
        this.ghost.setTexture(tex.key).setScale(tex.scale).setPosition(at.x, at.y + 2).setVisible(true);
      }
    }
    this.sellZoneBg.setFillStyle(ERASE_COLOR, overSell ? 0.4 : 0.18);
    this.costLabel
      .setText(`Bán hoàn $${buildRefund(def)}`)
      .setBackgroundColor("#3d2c29")
      .setPosition(cellRect(selected.cx, selected.cy).right + 4, cellRect(selected.cx, selected.cy).top)
      .setVisible(overSell);
  }

  private clearPreview() {
    this.preview.clear();
    this.ghost.setVisible(false);
    this.costLabel.setVisible(false);
  }

  // ---------------------------------------------------------------- Prop selection + keyboard (build parity with decorate)

  /** R turns the current piece: a prop tool's ghost, or the selected placed prop (saved right away). */
  rotate() {
    if (!this.enabled) return;
    if (this.tool) {
      const def = getBuildTile(this.tool);
      if (!def || buildRotationCount(def) < 2) return;
      this.ghostRotation = (this.ghostRotation + 1) % buildRotationCount(def);
      if (this.hoverCell) this.showPreview(this.hoverCell, this.hoverCell);
      return;
    }
    const selected = this.selected;
    if (!selected) return;
    const def = getBuildTile(selected.kind);
    if (!def || buildRotationCount(def) < 2) return;
    const next = (selected.rotation + 1) % buildRotationCount(def);
    // Turn in place: same cell, new facing (see moveTile's rotateOnly).
    this.room.send(Messages.MoveTile, { cx: selected.cx, cy: selected.cy, toCx: selected.cx, toCy: selected.cy, rotation: next });
    this.select({ ...selected, rotation: next });
    this.scene.time.delayedCall(RESYNC_MS, () => this.syncSelected());
  }

  /** R turns, Delete sells, Esc deselects. Physical key codes, so Vietnamese IMEs don't swallow them. */
  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.enabled) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest("input, textarea, [contenteditable]")) return;
    if (e.code === "KeyR" && !e.repeat) {
      e.preventDefault();
      this.rotate();
      return;
    }
    if (e.code === "Escape" && this.selected) {
      e.preventDefault();
      this.cancelPropDrag();
      this.select(undefined);
      this.clearPreview();
      return;
    }
    if (e.code === "Delete" && !e.repeat && this.selected && !this.tool) {
      e.preventDefault();
      const { cx, cy } = this.selected;
      this.cancelPropDrag();
      this.select(undefined);
      this.clearPreview();
      this.room.send(Messages.SellTile, { cx, cy });
    }
  };

  /** Select (or deselect) a placed prop: shows the highlight around its cell. */
  private select(selected: SelectedProp | undefined) {
    this.selected = selected;
    if (!selected) return this.selection.setVisible(false);
    const r = cellRect(selected.cx, selected.cy);
    this.selection.setPosition(r.left, r.top).setSize(BUILD_TILE, BUILD_TILE).setVisible(true);
  }

  /** Drop a prop drag in progress (Esc / mode change): hides the sell zone too. */
  private cancelPropDrag() {
    this.dragProp = undefined;
    this.sellZone.setVisible(false);
  }

  /** The prop standing on `cell`, if any (host-only interactions use this). */
  private propAt(cell: { cx: number; cy: number }): SelectedProp | undefined {
    const tiles = this.room.state.tiles;
    if (!tiles) return undefined;
    const key = tileKey(cell.cx, cell.cy, "structure");
    const kind = tiles.get(key);
    const def = kind ? getBuildTile(kind) : undefined;
    if (!kind || def?.shape !== "prop") return undefined;
    return { cx: cell.cx, cy: cell.cy, key, kind, rotation: normalizeTileRotation(def, this.room.state.tileRotations?.get(key)) };
  }

  /** Snap the optimistic selection back to the synced state (the server may have rejected the move/turn). */
  private syncSelected() {
    const selected = this.selected;
    if (!selected) return;
    const kind = this.room.state.tiles?.get(selected.key);
    if (!kind) return; // not synced yet (or rejected): keep the optimistic selection
    const def = getBuildTile(kind);
    if (!def || def.shape !== "prop") return this.select(undefined);
    this.select({ ...selected, kind, rotation: normalizeTileRotation(def, this.room.state.tileRotations?.get(selected.key)) });
  }

  /** (x, y) = screen position (the zone doesn't scroll with the camera). */
  private isOverSellZone(x: number, y: number) {
    const z = this.sellZone;
    return Math.abs(x - z.x) <= this.sellZoneBg.width / 2 && Math.abs(y - z.y) <= this.sellZoneBg.height / 2;
  }

  /** Guests (not the host) may only build on empty cells (see planCellChange's onlyEmpty). */
  private isHost(): boolean {
    return !!this.room.state.players?.get(this.room.sessionId)?.host;
  }

  private money(): number {
    const me = this.room.state.players?.get(this.room.sessionId);
    return me?.money ?? 0;
  }

  /** Light cell grid over the yard, with the shop's lot tinted (nothing can be built there). */
  private drawGrid() {
    const g = this.grid;
    g.lineStyle(1, 0xffffff, 0.35);
    for (let c = 0; c <= YARD_COLS; c++) g.lineBetween(YARD.x + c * BUILD_TILE, YARD.y, YARD.x + c * BUILD_TILE, YARD.y + YARD.height);
    for (let r = 0; r <= YARD_ROWS; r++) g.lineBetween(YARD.x, YARD.y + r * BUILD_TILE, YARD.x + YARD.width, YARD.y + r * BUILD_TILE);
    g.fillStyle(ERASE_COLOR, 0.12).fillRect(SHOP_LOT.left, SHOP_LOT.top, SHOP_LOT.right - SHOP_LOT.left, SHOP_LOT.bottom - SHOP_LOT.top);
  }
}
