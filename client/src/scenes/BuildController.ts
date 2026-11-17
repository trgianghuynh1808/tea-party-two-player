import Phaser from "phaser";
import type { Room } from "@colyseus/sdk";
import {
  BUILD_TILE,
  ERASE_TOOL,
  Messages,
  SHOP_LOT,
  YARD,
  YARD_COLS,
  YARD_ROWS,
  buildRefund,
  cellAt,
  cellRect,
  cellsForTool,
  PROP_SCALE,
  getBuildTile,
  propAnchor,
  planCellChange,
  type BuildTilesMessage,
} from "@boba/shared";
import type { BobaShopState } from "@boba/shared/schema";
import { propKey } from "./YardView";

const UI_DEPTH = 15000;
const OK_COLOR = 0x2a9d8f;
const ERASE_COLOR = 0xe63946;

/**
 * Build mode in the yard (host only): pick a tool in the DOM panel, then drag over the land.
 * Floors / the eraser fill the dragged rectangle, walls and fences draw its outline, a door goes on one cell.
 * The preview shows the affected cells and the price; the server re-checks and applies it.
 */
export class BuildController {
  private enabled = false;
  private tool = "floor_wood";
  private dragStart?: { cx: number; cy: number };
  private dragPointerId = -1;
  private readonly grid: Phaser.GameObjects.Graphics;
  private readonly preview: Phaser.GameObjects.Graphics;
  private readonly costLabel: Phaser.GameObjects.Text;
  /** Props: see-through preview of the object where it would stand. */
  private readonly ghost: Phaser.GameObjects.Image;

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
    this.ghost = scene.add.image(0, 0, "__DEFAULT").setOrigin(0.5, 1).setScale(PROP_SCALE).setAlpha(0.65).setDepth(UI_DEPTH - 3).setVisible(false);

    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onMove, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onUp, this);
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.grid.setVisible(enabled);
    this.dragStart = undefined;
    this.clearPreview();
  }

  setTool(tool: string) {
    this.tool = tool;
    this.clearPreview();
  }

  destroy() {
    this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.onMove, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.onUp, this);
  }

  private onDown(pointer: Phaser.Input.Pointer) {
    if (!this.enabled || this.dragStart) return;
    const cell = cellAt(pointer.worldX, pointer.worldY);
    if (cell.cx < 0 || cell.cy < 0 || cell.cx >= YARD_COLS || cell.cy >= YARD_ROWS) return;
    this.dragStart = cell;
    this.dragPointerId = pointer.id;
    this.showPreview(cell, cell);
  }

  private onMove(pointer: Phaser.Input.Pointer) {
    if (!this.enabled) return;
    const cell = cellAt(pointer.worldX, pointer.worldY);
    if (this.dragStart) {
      if (pointer.id === this.dragPointerId) this.showPreview(this.dragStart, cell);
    } else if (!pointer.isDown) {
      // Hover: show what a single click would do.
      this.showPreview(cell, cell);
    }
  }

  private onUp(pointer: Phaser.Input.Pointer) {
    if (!this.enabled || !this.dragStart || pointer.id !== this.dragPointerId) return;
    const end = cellAt(pointer.worldX, pointer.worldY);
    const start = this.dragStart;
    this.dragStart = undefined;
    this.clearPreview();
    if (!cellsForTool(this.tool, start.cx, start.cy, end.cx, end.cy).length) return;
    const msg: BuildTilesMessage = { tool: this.tool, x0: start.cx, y0: start.cy, x1: end.cx, y1: end.cy };
    this.room.send(Messages.BuildTiles, msg);
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
      const change = tiles && planCellChange(tiles, this.tool, cx, cy);
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
    if (def?.shape === "prop" && this.scene.textures.exists(propKey(def.kind))) {
      const at = propAnchor(to.cx, to.cy);
      this.ghost.setTexture(propKey(def.kind)).setPosition(at.x, at.y + 2).setVisible(true);
    }
    const r = cellRect(to.cx, to.cy);
    const text = cost >= 0 ? `${count} ô · $${cost}` : `${count} ô · hoàn $${-cost}`;
    this.costLabel
      .setText(text)
      .setBackgroundColor(cost > 0 && cost > this.money() ? "#e63946" : "#3d2c29")
      .setPosition(r.right + 4, r.top)
      .setVisible(true);
  }

  private clearPreview() {
    this.preview.clear();
    this.ghost.setVisible(false);
    this.costLabel.setVisible(false);
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
