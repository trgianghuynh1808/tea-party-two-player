import {
  DECOR_GRID,
  ERASE_TOOL,
  buildRefund,
  areaOf,
  cellsForTool,
  getBuildTile,
  isBlocking,
  planCellChange,
  canPlaceDecoration,
  getDecorationDef,
  normalizeRotation,
  refundFor,
  snapToGrid,
  type Area,
  type PlacedDecoration,
  type ShopSave,
} from "@boba/shared";
import { loadShop, saveShop, upsertUser } from "../persistence/ShopStore.js";

/** Wait this long after the last change before writing the save (batches rapid edits). */
const SAVE_DEBOUNCE_MS = 1000;
/** Restoring a save: how many grid steps a piece may be pushed down to fit the current layout. */
const RESTORE_NUDGE_STEPS = 12;

export type Piece = Required<PlacedDecoration>;

/** A piece as shown in admin views: its catalog info plus which venue it stands in. */
export interface PieceInfo {
  id: string;
  kind: string;
  label: string;
  price: number;
  x: number;
  y: number;
  rotation: number;
  /** From areaOf: pieces can only be placed inside a room, so this is "shop" or "restaurant" in practice. */
  venue: Area;
}

/** How much money to give back for removed pieces: the full price, or nothing. */
export type RefundMode = "full" | "none";

/** What changed in the shop; every open room mirrors these into its synced state. */
export type ShopEvent =
  | { type: "money"; money: number }
  | { type: "added"; piece: Piece }
  | { type: "moved"; piece: Piece }
  | { type: "removed"; id: string }
  /** Yard tiles changed: [tileKey, kind] pairs, kind "" = removed. */
  | { type: "tiles"; changes: [string, string][] };

/**
 * One player's shop (money + furniture), shared by every room that uses it: the room the player
 * opened (its furniture) and any room the player plays in (their money).
 * Rooms call buy/move/sell/earn and subscribe to changes, so two rooms never overwrite each other's save.
 * (In-process state: assumes a single server process, which is how the game is hosted.)
 */
export class SharedShop {
  money = 0;
  readonly pieces: Piece[] = [];
  /** Yard buildings: tileKey -> tile kind. */
  readonly tiles = new Map<string, string>();

  private seq = 0;
  private loading?: Promise<void>;
  private saveTimer?: ReturnType<typeof setTimeout>;
  private readonly listeners = new Set<(event: ShopEvent) => void>();

  constructor(readonly shopId: string) {}

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

  /** Add (or take, if negative) money; never goes below zero. Returns the change actually applied. */
  earn(amount: number): number {
    const next = Math.max(0, this.money + Math.round(amount));
    const delta = next - this.money;
    if (delta === 0) return 0;
    this.money = next;
    this.emit({ type: "money", money: this.money });
    this.scheduleSave();
    return delta;
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

  /**
   * All furniture with catalog info and its venue (tea shop / restaurant), for admin views.
   * A piece with an unknown kind (catalog changed) keeps its raw kind as the label at price 0.
   */
  piecesByVenue(): PieceInfo[] {
    return this.pieces.map((piece) => {
      const def = getDecorationDef(piece.kind);
      return {
        id: piece.id,
        kind: piece.kind,
        label: def?.label ?? piece.kind,
        price: def?.price ?? 0,
        x: piece.x,
        y: piece.y,
        rotation: piece.rotation,
        venue: areaOf({ x: piece.x, y: piece.y }),
      };
    });
  }

  /** Add (or take, when negative) money; never below zero. Returns the change actually applied. */
  adjustMoney(delta: number): number {
    return this.earn(delta);
  }

  /**
   * Remove pieces picked by id list or predicate (admin tool; unlike sell, this can refund the FULL
   * price). Emits "removed" per piece, then one "money" event when money changed. Returns totals.
   */
  removePieces(selector: string[] | ((piece: Piece) => boolean), refund: RefundMode): { removed: number; refunded: number } {
    let matches: (piece: Piece) => boolean;
    if (Array.isArray(selector)) {
      const ids = new Set(selector);
      matches = (piece) => ids.has(piece.id);
    } else {
      matches = selector;
    }
    let removed = 0;
    let refunded = 0;
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const piece = this.pieces[i];
      if (!matches(piece)) continue;
      this.pieces.splice(i, 1);
      const def = getDecorationDef(piece.kind);
      if (refund === "full" && def) refunded += def.price;
      this.emit({ type: "removed", id: piece.id });
      removed++;
    }
    if (!removed) return { removed, refunded };
    if (refunded) this.money += refunded;
    this.emit({ type: "money", money: this.money });
    this.scheduleSave();
    return { removed, refunded };
  }

  /**
   * Build (or erase) yard tiles over a dragged rectangle of cells (see cellsForTool). Cells already holding that
   * tile are skipped; replacing or erasing a tile refunds part of its price. `blocked` cells (a player stands there)
   * don't get walls. `payer` is whose wallet pays (default: this shop's owner); another player's wallet = a guest
   * building on this land, who may only build on empty cells (see planCellChange's onlyEmpty).
   * Returns an error message, or undefined on success.
   */
  build(
    tool: unknown,
    x0: unknown,
    y0: unknown,
    x1: unknown,
    y1: unknown,
    blocked: (cx: number, cy: number) => boolean,
    payer: SharedShop = this,
  ): string | undefined {
    const kind = String(tool);
    const def = getBuildTile(kind);
    const guest = payer !== this;
    if (!def && kind !== ERASE_TOOL) return "Không có loại này";
    if (guest && !def) return "Chỉ chủ phòng mới dỡ được";
    const solid = !!def && isBlocking(def);
    const changes: [string, string][] = [];
    let cost = 0;
    for (const { cx, cy } of cellsForTool(kind, Number(x0), Number(y0), Number(x1), Number(y1))) {
      const change = planCellChange(this.tiles, kind, cx, cy, guest);
      if (!change || (solid && blocked(cx, cy))) continue;
      const oldDef = getBuildTile(change.old);
      cost += (def?.price ?? 0) - (oldDef ? buildRefund(oldDef) : 0);
      changes.push([change.key, change.kind]);
    }
    if (!changes.length) return def ? (guest ? "Chỉ xây được trên ô trống" : "Không xây được ở đây") : undefined;
    if (cost > payer.money) return `Không đủ tiền (cần $${cost})`;

    for (const [key, k] of changes) {
      if (k) this.tiles.set(key, k);
      else this.tiles.delete(key);
    }
    payer.money -= cost;
    this.emit({ type: "tiles", changes });
    payer.emit({ type: "money", money: payer.money });
    this.scheduleSave();
    if (guest) payer.scheduleSave();
    return undefined;
  }

  /** Current money + furniture, in the save format (e.g. for a backup). */
  snapshot(): ShopSave {
    return {
      version: 1,
      money: this.money,
      decorations: this.pieces.map(({ kind, x, y, rotation }) => ({ kind, x, y, rotation })),
      tiles: Object.fromEntries(this.tiles),
    };
  }

  /**
   * Replace everything with a save (e.g. restoring a backup) and write it right away. Open rooms update live.
   * Returns how many pieces were dropped because they no longer fit the layout.
   */
  async replace(save: ShopSave): Promise<number> {
    await this.load(); // a load finishing later must not overwrite the restored state
    for (const piece of this.pieces.splice(0)) this.emit({ type: "removed", id: piece.id });
    const removedTiles = [...this.tiles.keys()].map((key): [string, string] => [key, ""]);
    this.tiles.clear();
    const dropped = this.apply(save);
    for (const piece of this.pieces) this.emit({ type: "added", piece });
    this.emit({ type: "tiles", changes: [...removedTiles, ...this.tiles] });
    this.emit({ type: "money", money: this.money });
    this.scheduleSave();
    await this.flush();
    return dropped;
  }

  /** Write pending changes now (e.g. when a room closes). */
  async flush() {
    if (!this.saveTimer) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    try {
      await saveShop(this.shopId, this.snapshot());
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
    this.apply(save);
    console.log(`[SharedShop] restored ${this.shopId}: $${this.money}, ${this.pieces.length} decorations`);
  }

  /** Load a save's money + furniture into memory (pieces must be empty). Returns how many pieces were dropped. */
  private apply(save: ShopSave): number {
    this.money = save.money;
    for (const [key, kind] of Object.entries(save.tiles ?? {})) this.tiles.set(key, kind);
    let dropped = 0;
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
      else dropped++;
    }
    if (dropped) console.warn(`[SharedShop] ${this.shopId}: ${dropped} decoration(s) no longer fit and were dropped`);
    return dropped;
  }
}

/** Shops opened on this server, by username key: one instance each, so every room sees the same state. */
const shops = new Map<string, SharedShop>();
const opening = new Map<string, Promise<SharedShop>>();

/**
 * Open the shop of a player: find or create their user record (users collection), then load the shop it
 * links to. Rejects when the storage can't be read; the next call retries.
 */
export function openShop(name: string, key: string, seen = true): Promise<SharedShop> {
  let pending = opening.get(key);
  if (!pending) {
    pending = (async () => {
      const user = await upsertUser(name, key, seen);
      let shop = shops.get(key);
      if (!shop) {
        shop = new SharedShop(user.shopId);
        shops.set(key, shop);
      }
      await shop.load();
      return shop;
    })().finally(() => opening.delete(key));
    opening.set(key, pending);
  }
  return pending;
}

/** The shop of a player already opened with openShop (by username key). */
export function shopOf(key: string): SharedShop {
  const shop = shops.get(key);
  if (!shop) throw new Error(`Shop of ${key} was not opened`);
  return shop;
}
