import {
  DECOR_GRID,
  SHARED_SHOP_ID,
  canPlaceDecoration,
  getDecorationDef,
  normalizeRotation,
  refundFor,
  snapToGrid,
  type PlacedDecoration,
} from "@boba/shared";
import { loadShop, saveShop } from "../persistence/ShopStore.js";

/** Wait this long after the last change before writing the save (batches rapid edits). */
const SAVE_DEBOUNCE_MS = 1000;
/** Restoring a save: how many grid steps a piece may be pushed down to fit the current layout. */
const RESTORE_NUDGE_STEPS = 12;

export type Piece = Required<PlacedDecoration>;

/** What changed in the shop; every open room mirrors these into its synced state. */
export type ShopEvent =
  | { type: "money"; money: number }
  | { type: "added"; piece: Piece }
  | { type: "moved"; piece: Piece }
  | { type: "removed"; id: string };

/**
 * The one shop (money + furniture) shared by every room on this server.
 * Rooms call buy/move/sell/earn and subscribe to changes, so furniture bought in one room
 * shows up right away in the others and two rooms never overwrite each other's save.
 * (In-process state: assumes a single server process, which is how the game is hosted.)
 */
export class SharedShop {
  money = 0;
  readonly pieces: Piece[] = [];

  private seq = 0;
  private loading?: Promise<void>;
  private saveTimer?: ReturnType<typeof setTimeout>;
  private readonly listeners = new Set<(event: ShopEvent) => void>();

  constructor(private readonly shopId: string) {}

  /**
   * Load the save once (later calls reuse it). Rejects when the storage can't be read; the next call
   * retries. Nothing is ever saved before a successful load, so an outage can't wipe the real save.
   */
  load(): Promise<void> {
    this.loading ??= this.restore().catch((err) => {
      this.loading = undefined;
      throw err;
    });
    return this.loading;
  }

  /** Listen to changes; returns the unsubscribe function. */
  subscribe(listener: (event: ShopEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  earn(amount: number) {
    this.money += amount;
    this.emit({ type: "money", money: this.money });
    this.scheduleSave();
  }

  /** Buy and place a piece. Returns an error message, or undefined on success. */
  buy(kind: unknown, x: unknown, y: unknown, rotation: unknown): string | undefined {
    const def = getDecorationDef(String(kind));
    if (!def) return "Món này không có";
    const px = snapToGrid(Number(x));
    const py = snapToGrid(Number(y));
    const rot = normalizeRotation(def, rotation);
    if (this.money < def.price) return `Không đủ tiền (cần $${def.price})`;
    if (!canPlaceDecoration(def.kind, px, py, this.pieces, undefined, rot)) return "Không đặt được ở đây";

    this.money -= def.price;
    const piece = this.place(def.kind, px, py, rot);
    this.emit({ type: "money", money: this.money });
    this.emit({ type: "added", piece });
    this.scheduleSave();
    return undefined;
  }

  /** Move and/or turn a piece (rotation undefined = keep it). Returns an error message, or undefined. */
  move(id: unknown, x: unknown, y: unknown, rotation: unknown): string | undefined {
    const piece = this.pieces.find((p) => p.id === id);
    const def = piece && getDecorationDef(piece.kind);
    if (!piece || !def) return "Món này đã bị bán";
    const px = snapToGrid(Number(x));
    const py = snapToGrid(Number(y));
    const rot = rotation === undefined ? piece.rotation : normalizeRotation(def, rotation);
    if (!canPlaceDecoration(piece.kind, px, py, this.pieces, piece.id, rot)) return "Không đặt được ở đây";

    piece.x = px;
    piece.y = py;
    piece.rotation = rot;
    this.emit({ type: "moved", piece });
    this.scheduleSave();
    return undefined;
  }

  /** Sell a piece back (partial refund). */
  sell(id: unknown) {
    const index = this.pieces.findIndex((p) => p.id === id);
    if (index < 0) return;
    const [piece] = this.pieces.splice(index, 1);
    const def = getDecorationDef(piece.kind);
    if (def) this.money += refundFor(def);
    this.emit({ type: "removed", id: piece.id });
    this.emit({ type: "money", money: this.money });
    this.scheduleSave();
  }

  /** Write pending changes now (e.g. when a room closes). */
  async flush() {
    if (!this.saveTimer) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    try {
      await saveShop(this.shopId, {
        version: 1,
        money: this.money,
        decorations: this.pieces.map(({ kind, x, y, rotation }) => ({ kind, x, y, rotation })),
      });
    } catch (err) {
      console.error(`[SharedShop] failed to save shop ${this.shopId}`, err);
    }
  }

  private scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.flush(), SAVE_DEBOUNCE_MS);
  }

  private emit(event: ShopEvent) {
    for (const listener of this.listeners) listener(event);
  }

  private place(kind: string, x: number, y: number, rotation: number): Piece {
    const piece: Piece = { id: `deco_${++this.seq}`, kind, x, y, rotation };
    this.pieces.push(piece);
    return piece;
  }

  private async restore() {
    const save = await loadShop(this.shopId);
    if (!save) return;
    this.money = save.money;
    for (const d of save.decorations) {
      // Re-validate in case the layout or catalog changed since the save. Pieces that no longer fit
      // (e.g. under the back wall / machines added later) are nudged down a few grid steps instead of dropped.
      const def = getDecorationDef(d.kind);
      const rotation = def ? normalizeRotation(def, d.rotation) : 0;
      let y = d.y;
      for (let step = 0; step < RESTORE_NUDGE_STEPS && !canPlaceDecoration(d.kind, d.x, y, this.pieces, undefined, rotation); step++) {
        y += DECOR_GRID;
      }
      if (canPlaceDecoration(d.kind, d.x, y, this.pieces, undefined, rotation)) this.place(d.kind, d.x, y, rotation);
    }
    console.log(`[SharedShop] restored ${this.shopId}: $${this.money}, ${this.pieces.length} decorations`);
  }
}

export const sharedShop = new SharedShop(SHARED_SHOP_ID);
