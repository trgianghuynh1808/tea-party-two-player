import {
  DECOR_GRID,
  DECOR_ROOMS,
  ERASE_TOOL,
  buildRefund,
  areaOf,
  cellsForTool,
  getBuildTile,
  isBlocking,
  normalizeTileRotation,
  planCellChange,
  planTileMove,
  planTileSell,
  canPlaceDecoration,
  footprintOf,
  getDecorationDef,
  normalizeRotation,
  piecesOnSurface,
  refundFor,
  snapToGrid,
  tileKey,
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

/** A yard-tile kind as shown in admin views: its catalog info plus how many cells hold it. */
export interface TileKindInfo {
  kind: string;
  label: string;
  price: number;
  shape: string;
  count: number;
}

/** What changed in the shop; every open room mirrors these into its synced state. */
export type ShopEvent =
  | { type: "money"; money: number }
  | { type: "added"; piece: Piece }
  | { type: "moved"; piece: Piece }
  | { type: "removed"; id: string }
  /** Yard tiles changed: [tileKey, kind] pairs, kind "" = removed. */
  | { type: "tiles"; changes: [string, string][] }
  /** Prop facings changed: [tileKey, rotation] pairs, null = no prop on the key anymore. */
  | { type: "tileRotations"; changes: [string, number | null][] };

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
  /** Facings of yard props: structure tileKey -> rotation index (see buildRotationCount). */
  readonly tileRotations = new Map<string, number>();

  private seq = 0;
  private loading?: Promise<void>;
  private saveTimer?: ReturnType<typeof setTimeout>;
  /** Set by discard(): a deleted user's shop must never be written back to storage. */
  private discarded = false;
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

  /** True while at least one room listens to this shop (the player is in a game). */
  isInUse(): boolean {
    return this.listeners.size > 0;
  }

  /**
   * Retire this shop before its records are deleted: cancel any pending save and refuse all later
   * writes, so a late flush() can never write the just-deleted save back to storage.
   */
  discard(): void {
    this.discarded = true;
    clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
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
    // Gadgets standing on this piece (found via its current position, before anything moves).
    // piecesOnSurface returns members of this.pieces, so they are full Pieces.
    const carried = (def.surface ? piecesOnSurface(piece, this.pieces) : []) as Piece[];
    // Turning a surface would leave its gadgets floating on the turned footprint: refuse.
    if (carried.length && rot !== piece.rotation) return "Dọn đồ trên bàn trước khi xoay";
    if (!canPlaceDecoration(piece.kind, px, py, this.pieces, piece.id, rot)) return "Không đặt được ở đây";

    const dx = px - piece.x;
    const dy = py - piece.y;
    piece.x = px;
    piece.y = py;
    piece.rotation = rot;
    this.emit({ type: "moved", piece });
    // The gadgets travel with the table: their offset within its footprint stays valid.
    for (const item of carried) {
      item.x += dx;
      item.y += dy;
      this.emit({ type: "moved", piece: item });
    }
    this.scheduleSave();
    return undefined;
  }

  /** Sell a piece back (partial refund); a surface sells every gadget standing on it along with it. */
  sell(id: unknown) {
    const index = this.pieces.findIndex((p) => p.id === id);
    if (index < 0) return;
    const [piece] = this.pieces.splice(index, 1);
    const def = getDecorationDef(piece.kind);
    if (def) this.money += refundFor(def);
    this.emit({ type: "removed", id: piece.id });
    // The gadgets on the sold surface go with it: one refund each, still a single money event.
    if (def?.surface) {
      for (const item of piecesOnSurface(piece, this.pieces)) {
        const at = this.pieces.findIndex((p) => p.id === item.id);
        if (at < 0) continue;
        this.pieces.splice(at, 1);
        const itemDef = getDecorationDef(item.kind);
        if (itemDef) this.money += refundFor(itemDef);
        this.emit({ type: "removed", id: item.id });
      }
    }
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
   * Yard tiles grouped by kind (admin views). A kind no longer in the catalog keeps its raw kind as
   * the label, at price 0, with shape "unknown". Sorted by descending count.
   */
  tilesByKind(): TileKindInfo[] {
    const counts = new Map<string, number>();
    for (const kind of this.tiles.values()) counts.set(kind, (counts.get(kind) ?? 0) + 1);
    return [...counts.entries()]
      .map(([kind, count]) => {
        const def = getBuildTile(kind);
        return { kind, label: def?.label ?? kind, price: def?.price ?? 0, shape: def?.shape ?? "unknown", count };
      })
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Remove yard tiles picked by kind list, or all of them (admin tool; refunds the FULL price per
   * cell, unknown kinds are worth $0). Emits one "tiles" event with every removed cell, then a
   * "money" event. Returns totals; nothing is emitted when no tile matched.
   */
  removeTiles(selector: string[] | "all", refund: RefundMode): { removed: number; refunded: number } {
    const kinds = selector === "all" ? undefined : new Set(selector);
    const changes: [string, string][] = [];
    const rotationChanges: [string, number | null][] = [];
    let refunded = 0;
    for (const [key, kind] of this.tiles) {
      if (kinds && !kinds.has(kind)) continue;
      this.tiles.delete(key);
      changes.push([key, ""]);
      if (this.tileRotations.delete(key)) rotationChanges.push([key, null]);
      if (refund === "full") refunded += getBuildTile(kind)?.price ?? 0;
    }
    if (!changes.length) return { removed: 0, refunded: 0 };
    if (refunded) this.money += refunded;
    this.emit({ type: "tiles", changes });
    if (rotationChanges.length) this.emit({ type: "tileRotations", changes: rotationChanges });
    this.emit({ type: "money", money: this.money });
    this.scheduleSave();
    return { removed: changes.length, refunded };
  }

  /**
   * Build (or erase) yard tiles over a dragged rectangle of cells (see cellsForTool). Cells already holding that
   * tile are skipped; replacing or erasing a tile refunds part of its price. `rotation` is which way a new prop
   * faces (other shapes can't turn). `blocked` cells (a player stands there) don't get walls. `payer` is whose
   * wallet pays (default: this shop's owner); another player's wallet = a guest building on this land, who may
   * only build on empty cells (see planCellChange's onlyEmpty). Returns an error message, or undefined on success.
   */
  build(
    tool: unknown,
    x0: unknown,
    y0: unknown,
    x1: unknown,
    y1: unknown,
    rotation: unknown,
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

    const rotationChanges: [string, number | null][] = [];
    for (const [key, k] of changes) {
      if (k) this.tiles.set(key, k);
      else this.tiles.delete(key);
      const newDef = getBuildTile(k);
      if (newDef?.shape === "prop") {
        const rot = normalizeTileRotation(newDef, rotation);
        this.tileRotations.set(key, rot);
        rotationChanges.push([key, rot]);
      } else if (this.tileRotations.delete(key)) {
        rotationChanges.push([key, null]);
      }
    }
    payer.money -= cost;
    this.emit({ type: "tiles", changes });
    if (rotationChanges.length) this.emit({ type: "tileRotations", changes: rotationChanges });
    payer.emit({ type: "money", money: payer.money });
    this.scheduleSave();
    if (guest) payer.scheduleSave();
    return undefined;
  }

  /**
   * Move and/or turn a placed prop (host only; the room validates). Moving onto the same cell = turning in
   * place. `rotation` omitted = keep the current facing. `blocked` cells (a player stands there) refuse the
   * move of a blocking prop. Returns an error message, or undefined on success.
   */
  moveTile(
    cx: unknown,
    cy: unknown,
    toCx: unknown,
    toCy: unknown,
    rotation: unknown,
    blocked: (cx: number, cy: number) => boolean,
  ): string | undefined {
    const from = tileKey(Number(cx), Number(cy), "structure");
    const plan = planTileMove(this.tiles, from, Number(toCx), Number(toCy));
    if (!plan) return "Không di chuyển được ô này";
    const def = getBuildTile(plan.kind);
    if (!def) return "Không có loại này";
    const current = this.tileRotations.get(from) ?? 0;
    const rot = rotation === undefined ? current : normalizeTileRotation(def, rotation);
    if (plan.rotateOnly) {
      if (rot === current) return undefined;
      this.tileRotations.set(from, rot);
      this.emit({ type: "tileRotations", changes: [[from, rot]] });
      this.scheduleSave();
      return undefined;
    }
    if (isBlocking(def) && blocked(Number(toCx), Number(toCy))) return "Có người đứng trên ô đó";
    this.tiles.delete(from);
    this.tiles.set(plan.to, plan.kind);
    this.tileRotations.delete(from);
    this.tileRotations.set(plan.to, rot);
    this.emit({ type: "tiles", changes: [[from, ""], [plan.to, plan.kind]] });
    this.emit({ type: "tileRotations", changes: [[from, null], [plan.to, rot]] });
    this.scheduleSave();
    return undefined;
  }

  /**
   * Sell a placed prop back (host only; the room validates): refunds BUILD_REFUND_RATE of its price to this
   * shop's owner. Returns an error message, or undefined on success.
   */
  sellTile(cx: unknown, cy: unknown): string | undefined {
    const key = tileKey(Number(cx), Number(cy), "structure");
    const plan = planTileSell(this.tiles, key);
    if (!plan) return "Không bán được ô này";
    const def = getBuildTile(plan.kind);
    if (!def) return "Không có loại này";
    this.tiles.delete(key);
    this.tileRotations.delete(key);
    this.money += buildRefund(def);
    this.emit({ type: "tiles", changes: [[key, ""]] });
    this.emit({ type: "tileRotations", changes: [[key, null]] });
    this.emit({ type: "money", money: this.money });
    this.scheduleSave();
    return undefined;
  }

  /** Current money + furniture, in the save format (e.g. for a backup). */
  snapshot(): ShopSave {
    return {
      version: 1,
      money: this.money,
      decorations: this.pieces.map(({ kind, x, y, rotation }) => ({ kind, x, y, rotation })),
      tiles: Object.fromEntries(this.tiles),
      tileRotations: Object.fromEntries(this.tileRotations),
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
    const removedRotations = [...this.tileRotations.keys()].map((key): [string, number | null] => [key, null]);
    this.tileRotations.clear();
    const dropped = this.apply(save);
    for (const piece of this.pieces) this.emit({ type: "added", piece });
    this.emit({ type: "tiles", changes: [...removedTiles, ...this.tiles] });
    this.emit({ type: "tileRotations", changes: [...removedRotations, ...this.tileRotations] });
    this.emit({ type: "money", money: this.money });
    this.scheduleSave();
    await this.flush();
    return dropped;
  }

  /** Write pending changes now (e.g. when a room closes). Never writes a discarded shop. */
  async flush() {
    if (this.discarded) return;
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
    if (this.discarded) return;
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
    // Old saves have no facings: props keep facing front (rotation 0).
    for (const [key, rot] of Object.entries(save.tileRotations ?? {})) {
      const def = getBuildTile(this.tiles.get(key));
      if (def?.shape === "prop") this.tileRotations.set(key, normalizeTileRotation(def, rot));
    }
    let dropped = 0;
    // Standing pieces (tables included) are placed first and tabletop gadgets after, so each gadget
    // is validated against its table's restored position; a gadget whose table is gone gets nudged
    // (e.g. to follow a table that moved down) and dropped when no surface takes it.
    const isTabletop = (d: { kind: string }) => getDecorationDef(d.kind)?.layer === "tabletop";
    const saved = save.decorations.filter((d) => !isTabletop(d));
    saved.push(...save.decorations.filter(isTabletop));
    for (const d of saved) {
      // Re-validate in case the layout or catalog changed since the save. Pieces that no longer fit
      // (e.g. under the back wall / machines added later) are nudged down a few grid steps instead of dropped.
      const def = getDecorationDef(d.kind);
      const rotation = def ? normalizeRotation(def, d.rotation) : 0;
      let x = d.x;
      let y = d.y;
      // A room may have shrunk since the save: pull old restaurant pieces back inside its floor box
      // (clamped with their footprint) before nudging, so they move into the smaller room instead of being dropped.
      const room = DECOR_ROOMS.find((r) => r.area === "restaurant");
      if (def && room && areaOf({ x, y }) === "restaurant") {
        const { floor } = room;
        const size = footprintOf(def, rotation);
        x = Math.min(Math.max(x, floor.minX + size.width / 2), floor.maxX - size.width / 2);
        y = Math.min(Math.max(y, floor.minY + size.height / 2), floor.maxY - size.height / 2);
      }
      for (let step = 0; step < RESTORE_NUDGE_STEPS && !canPlaceDecoration(d.kind, x, y, this.pieces, undefined, rotation); step++) {
        y += DECOR_GRID;
      }
      if (canPlaceDecoration(d.kind, x, y, this.pieces, undefined, rotation)) this.place(d.kind, x, y, rotation);
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

/**
 * Drop the cached shop of a player (by username key) before deleting their records: the instance is
 * discarded (no more writes) and removed from the cache, so the next openShop starts fresh ($0).
 */
export function forgetShop(key: string): void {
  shops.get(key)?.discard();
  shops.delete(key);
}
