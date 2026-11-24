import Phaser from "phaser";
import type { Room } from "@colyseus/sdk";
import {
  DECOR_GRID,
  Messages,
  VIEW_ORDER,
  WALL_BOTTOM,
  DECOR_ROOMS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  canPlaceDecoration,
  DECORATION_CATALOG,
  footprintOf,
  getDecorationDef,
  normalizeRotation,
  piecesOnSurface,
  rotationCount,
  snapToGrid,
  surfaceUnder,
  type DecorationDef,
} from "@boba/shared";
import type { BobaShopState, Decoration } from "@boba/shared/schema";
import type { PaletteDragStart } from "../ui/DecorPanel";
import { layoutRect, toLayout } from "../forceLandscape";

const OK_COLOR = 0x2a9d8f;
const BAD_COLOR = 0xe63946;
const SELECT_COLOR = 0xffd166;
const FLOOR_DEPTH = -500; // rugs: above the floor tiles, below everything else
/** Wall art: above the wall itself (ShopScene WALL_DEPTH), below anything standing on the floor. */
const WALL_DECOR_DEPTH = -800;
const UI_DEPTH = 15000;
/** Decorate-mode overlay: a light veil over the floor and the wall with a cell grid so positions are easy to read. */
const GRID_CELL = DECOR_GRID * 4;
const VEIL_ALPHA = 0.35;
const GRID_LINE_ALPHA = 0.35;
/** If the server rejects a move/turn, the synced state doesn't change: re-sync to it after this long. */
const RESYNC_MS = 600;

export const decorTextureKey = (kind: string, view?: string) => (view ? `decor-${kind}-${view}` : `decor-${kind}`);

/** Load the artwork of every catalog item (call from the scene's preload). */
export function preloadDecorTextures(scene: Phaser.Scene) {
  for (const def of DECORATION_CATALOG) {
    if (def.image) scene.load.image(decorTextureKey(def.kind), def.image);
    for (const [view, url] of Object.entries(def.views ?? {})) scene.load.image(decorTextureKey(def.kind, view), url);
  }
}

/**
 * World point of a bed's pillow (where a sleeper's head goes), from DecorationDef.pillow and the drawn artwork
 * (bottom-aligned on the footprint like buildDecorVisual, mirrored when flipped). Beds with per-facing artwork
 * (pillows) read the pillow of the current view instead, never flipped.
 */
export function bedPillowPoint(scene: Phaser.Scene, bed: { kind: string; x: number; y: number; rotation?: number }): { x: number; y: number } {
  const def = getDecorationDef(bed.kind);
  if (!def?.pillow) return { x: bed.x, y: bed.y };
  const rotation = normalizeRotation(def, bed.rotation);
  if (def.rotation === "views" && def.pillows) {
    const view = VIEW_ORDER[rotation];
    const pillow = def.pillows[view];
    const key = decorTextureKey(def.kind, view);
    const source = scene.textures.exists(key) ? scene.textures.get(key).getSourceImage() : undefined;
    const scale = viewsScale(scene, def);
    const artWidth = source && scale ? source.width * scale : footprintOf(def, rotation).width;
    const artHeight = source && scale ? source.height * scale : (def.imageHeight ?? def.height);
    return { x: bed.x + (pillow.x - 0.5) * artWidth, y: bed.y + def.height / 2 - artHeight * (1 - pillow.y) };
  }
  const artHeight = def.imageHeight ?? def.height;
  const key = decorTextureKey(def.kind);
  const source = scene.textures.exists(key) ? scene.textures.get(key).getSourceImage() : undefined;
  const artWidth = source ? (source.width * artHeight) / source.height : def.width;
  const flipped = def.rotation === "flip" && bed.rotation === 1;
  const fx = flipped ? 1 - def.pillow.x : def.pillow.x;
  return { x: bed.x + (fx - 0.5) * artWidth, y: bed.y + def.height / 2 - artHeight * (1 - def.pillow.y) };
}

/** Views furniture shares one scale, set by the front artwork's height, so every facing keeps the same pixel/world ratio. */
function viewsScale(scene: Phaser.Scene, def: DecorationDef): number | undefined {
  if (def.rotation !== "views") return undefined;
  const key = decorTextureKey(def.kind);
  if (!scene.textures.exists(key)) return undefined;
  return (def.imageHeight ?? def.height) / scene.textures.get(key).getSourceImage().height;
}

/**
 * The visible part of a piece of furniture turned to `rotation`, centred on its floor footprint.
 * Artwork stands on the footprint (bottom-aligned) and may rise above it; rugs fill the footprint.
 * Returns the objects plus the box they cover (for the drag hit area).
 */
function buildDecorVisual(
  scene: Phaser.Scene,
  def: DecorationDef,
  rotation: number,
  alpha = 1,
): { objects: Phaser.GameObjects.GameObject[]; width: number; halfHeight: number; hasArt: boolean } {
  const size = footprintOf(def, rotation);
  const viewKey = def.rotation === "views" ? decorTextureKey(def.kind, VIEW_ORDER[rotation]) : undefined;
  const key = viewKey && scene.textures.exists(viewKey) ? viewKey : decorTextureKey(def.kind);
  if (scene.textures.exists(key)) {
    const img = scene.add.image(0, 0, key).setAlpha(alpha);
    if (def.layer === "floor" || def.layer === "wall" || def.layer === "tabletop") {
      // Flat art filling its box (wall art never turns; top-down gadgets can't either).
      // Top-down art: size it unrotated, then turn it (a quarter turn swaps its on-screen width/height).
      img.setDisplaySize(def.width, def.height).setAngle(def.rotation === "rotate" ? rotation * 90 : 0);
      const effect = def.effect === "breeze" ? buildBreeze(scene, def.width, def.height / 2, alpha) : [];
      return { objects: [img, ...effect], width: size.width, halfHeight: size.height / 2, hasArt: true };
    }
    // Views share the front artwork's scale (not each view's own height) so all facings render at the same ratio.
    img.setOrigin(0.5, 1).setY(def.height / 2).setScale(viewsScale(scene, def) ?? (def.imageHeight ?? def.height) / img.height);
    if (def.rotation === "flip") img.setFlipX(rotation === 1);
    const top = Math.max(def.height / 2, img.displayHeight - def.height / 2);
    return { objects: [img], width: Math.max(def.width, img.displayWidth), halfHeight: top, hasArt: true };
  }
  const shape =
    def.shape === "circle"
      ? scene.add.circle(0, 0, size.width / 2, def.color, alpha)
      : scene.add.rectangle(0, 0, size.width, size.height, def.color, alpha);
  shape.setStrokeStyle(2, 0x3d2c29, def.layer === "floor" ? 0.35 : 1);
  if (def.layer === "floor") shape.setAlpha(0.75 * alpha);
  return { objects: [shape], width: size.width, halfHeight: size.height / 2, hasArt: false };
}

/** Breeze from an air conditioner: a few soft wavy strokes drifting down from its vent and fading out. */
const BREEZE_STROKES = 3;
const BREEZE_DRIFT = 22; // px travelled downwards per puff
const BREEZE_MS = 1800;

function buildBreeze(scene: Phaser.Scene, width: number, ventY: number, alpha: number): Phaser.GameObjects.GameObject[] {
  const objects: Phaser.GameObjects.GameObject[] = [];
  for (let i = 0; i < BREEZE_STROKES; i++) {
    const x = (i - (BREEZE_STROKES - 1) / 2) * (width / (BREEZE_STROKES + 0.5));
    const g = scene.add.graphics({ x, y: ventY });
    g.lineStyle(2, 0x9fd8f5, 1);
    const path = new Phaser.Curves.Spline([-8, 0, -3, 3, 3, -1, 8, 2]);
    path.draw(g, 16);
    g.setAlpha(0);
    scene.tweens.add({
      targets: g,
      y: ventY + BREEZE_DRIFT,
      alpha: { from: 0.8 * alpha, to: 0 },
      duration: BREEZE_MS,
      delay: (i * BREEZE_MS) / BREEZE_STROKES,
      repeat: -1,
    });
    g.once(Phaser.GameObjects.Events.DESTROY, () => scene.tweens.killTweensOf(g));
    objects.push(g);
  }
  return objects;
}

interface DecorView {
  state: Decoration;
  def: DecorationDef;
  container: Phaser.GameObjects.Container;
  outline: Phaser.GameObjects.Rectangle;
  /** Current artwork objects (rebuilt when the piece turns). */
  visual: Phaser.GameObjects.GameObject[];
  /** Rotation currently drawn (may differ from state.rotation while dragging / waiting for the server). */
  rotation: number;
  /**
   * While a tabletop piece is dragged: the floor coordinates under the pointer (the cursor points at
   * the raised surface, so these differ from the container's drawn position). Cleared on drag end.
   */
  dragFloor?: { x: number; y: number };
}

interface Ghost {
  def: DecorationDef;
  view: Phaser.GameObjects.Container;
  outline: Phaser.GameObjects.Rectangle;
  visual: Phaser.GameObjects.GameObject[];
  rotation: number;
  lastClient: { x: number; y: number };
}

/**
 * Furniture in the shop: renders synced decorations and, in "decorate mode", lets the player
 * - drag catalog items from the DOM panel into the shop (buy + place),
 * - drag placed furniture to move it, or onto the 🗑 zone to sell it,
 * - turn pieces with R / the ⟳ button (the piece being dragged, or the last one touched).
 * Placement is previewed with shared rules (canPlaceDecoration); the server re-validates.
 */
export class DecorController {
  private views = new Map<string, DecorView>();
  private enabled = false;
  private draggingId: string | null = null;
  private dragStart = { x: 0, y: 0, rotation: 0 };
  private lastDragPointer = { x: 0, y: 0 };
  /** Tabletop pieces riding the piece being dragged (they preview-follow it; the server moves them too). */
  private draggingCarried: DecorView[] = [];
  /** Last placed piece the player touched: R / ⟳ turns it. */
  private selectedId: string | null = null;
  private readonly grid: Phaser.GameObjects.Graphics;
  /** Floor area the dragged piece would cover (green = OK, red = blocked). */
  private readonly footprint: Phaser.GameObjects.Rectangle;
  private readonly sellZone: Phaser.GameObjects.Container;
  private readonly sellZoneBg: Phaser.GameObjects.Rectangle;
  private ghost?: Ghost;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly room: Room<BobaShopState>,
    private readonly fontSize: (px: number) => string,
  ) {
    // Above the floor, wall art and rugs, below stations, furniture and players.
    this.grid = scene.add.graphics().setDepth(FLOOR_DEPTH + 1).setVisible(false);
    // Tea shop and restaurant: the floor, and the strip of wall where art can hang.
    for (const room of DECOR_ROOMS) {
      this.drawGrid(room.floor.minX, room.floor.maxX, room.floor.minY, room.floor.maxY);
      this.drawGrid(room.wall.minX, room.wall.maxX, room.floor.minY - WALL_BOTTOM, room.wall.maxY);
    }
    this.footprint = scene.add.rectangle(0, 0, 1, 1, OK_COLOR, 0.3).setDepth(FLOOR_DEPTH + 2).setVisible(false);

    this.sellZoneBg = scene.add.rectangle(0, 0, 260, 56, 0xe63946, 0.18).setStrokeStyle(3, BAD_COLOR, 0.7);
    const sellText = scene.add
      .text(0, 0, "🗑 Thả vào đây để bán", { fontFamily: "sans-serif", fontSize: fontSize(15), fontStyle: "bold", color: "#b3261e" })
      .setOrigin(0.5);
    // Fixed on screen (the restaurant's camera scrolls): hit-tested with screen coordinates.
    this.sellZone = scene.add
      .container(WORLD_WIDTH / 2, WORLD_HEIGHT - 40, [this.sellZoneBg, sellText])
      .setDepth(UI_DEPTH)
      .setScrollFactor(0, 0, true)
      .setVisible(false);

    scene.input.on(Phaser.Input.Events.DRAG_START, this.onDragStart, this);
    scene.input.on(Phaser.Input.Events.DRAG, this.onDrag, this);
    scene.input.on(Phaser.Input.Events.DRAG_END, this.onDragEnd, this);
    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    window.addEventListener("keydown", this.onKeyDown);
  }

  get isEnabled() {
    return this.enabled;
  }

  /** Called when a decoration is added to the synced state. */
  add(state: Decoration) {
    const def = getDecorationDef(state.kind);
    if (!def) return;
    const rotation = normalizeRotation(def, state.rotation);
    const visual = buildDecorVisual(this.scene, def, rotation);
    const size = footprintOf(def, rotation);

    const outline = this.scene.add
      .rectangle(0, 0, size.width + 6, size.height + 6)
      .setStrokeStyle(3, OK_COLOR)
      .setVisible(false);
    const children: Phaser.GameObjects.GameObject[] = [...visual.objects, outline];
    // Plain shapes need a name; artwork speaks for itself.
    if (def.layer === "object" && !visual.hasArt) {
      children.push(
        this.scene.add
          .text(0, def.height / 2 + 8, def.label, { fontFamily: "sans-serif", fontSize: this.fontSize(10), color: "#3d2c29" })
          .setOrigin(0.5),
      );
    }

    // Hit area: a centred box tall enough to cover artwork that rises above the footprint.
    const container = this.scene.add.container(state.x, state.y, children).setSize(visual.width, visual.halfHeight * 2);
    const view: DecorView = { state, def, container, outline, visual: visual.objects, rotation };
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

  /** Synced rotation changed (or a local turn needs to snap back to the server's value). */
  syncRotation(id: string) {
    const view = this.views.get(id);
    if (!view || this.draggingId === id) return;
    this.renderRotation(view, normalizeRotation(view.def, view.state.rotation));
  }

  remove(id: string) {
    this.views.get(id)?.container.destroy();
    this.views.delete(id);
    if (this.selectedId === id) this.selectedId = null;
  }

  /** Turn decorate mode on/off: grid, draggable furniture. */
  setEnabled(enabled: boolean) {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    this.grid.setVisible(enabled);
    for (const view of this.views.values()) this.setDraggable(view, enabled);
    if (!enabled) {
      this.cancelGhost();
      this.select(null);
      this.footprint.setVisible(false);
      this.sellZone.setVisible(false);
    }
  }

  /**
   * Turn the piece being placed: the catalog item being dragged in, the placed piece being dragged,
   * or else the last placed piece the player touched (saved right away if it still fits).
   */
  rotate() {
    if (!this.enabled) return;
    if (this.ghost) {
      const g = this.ghost;
      this.setGhostRotation((g.rotation + 1) % rotationCount(g.def));
      this.updateGhost(g.lastClient.x, g.lastClient.y);
      return;
    }
    const dragged = this.draggingId ? this.views.get(this.draggingId) : undefined;
    if (dragged) {
      this.renderRotation(dragged, (dragged.rotation + 1) % rotationCount(dragged.def));
      this.previewDrag(dragged, this.lastDragPointer.x, this.lastDragPointer.y);
      return;
    }
    const id = this.selectedId;
    const view = id ? this.views.get(id) : undefined;
    if (!id || !view || rotationCount(view.def) === 1) return;
    const next = (view.rotation + 1) % rotationCount(view.def);
    const { x, y } = view.state;
    if (!canPlaceDecoration(view.def.kind, x, y, this.placed(), id, next)) {
      // Doesn't fit turned this way (e.g. a rug would hit a counter): flash red, keep it as is.
      view.outline.setStrokeStyle(3, BAD_COLOR);
      this.scene.time.delayedCall(400, () => this.selectedId === id && view.outline.setStrokeStyle(3, SELECT_COLOR));
      return;
    }
    this.renderRotation(view, next);
    this.room.send(Messages.MoveDecoration, { id, x, y, rotation: next });
    this.scene.time.delayedCall(RESYNC_MS, () => this.syncRotation(id));
  }

  destroy() {
    this.scene.input.off(Phaser.Input.Events.DRAG_START, this.onDragStart, this);
    this.scene.input.off(Phaser.Input.Events.DRAG, this.onDrag, this);
    this.scene.input.off(Phaser.Input.Events.DRAG_END, this.onDragEnd, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    window.removeEventListener("keydown", this.onKeyDown);
    this.cancelGhost();
  }

  // ---------------------------------------------------------------- Selection + keyboard

  /** R turns the current piece. Physical key code, so Vietnamese IMEs (Telex uses "r") don't swallow it. */
  private onKeyDown = (e: KeyboardEvent) => {
    if (e.code !== "KeyR" || e.repeat || !this.enabled) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest("input, textarea, [contenteditable]")) return;
    e.preventDefault();
    this.rotate();
  };

  /** Clicking empty floor clears the selection. */
  private onPointerDown(_pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) {
    if (this.enabled && !over.some((o) => this.viewOf(o))) this.select(null);
  }

  private select(id: string | null) {
    const prev = this.selectedId ? this.views.get(this.selectedId) : undefined;
    prev?.outline.setVisible(false);
    this.selectedId = id;
    const view = id ? this.views.get(id) : undefined;
    view?.outline.setVisible(true).setStrokeStyle(3, SELECT_COLOR);
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

  private onDragStart(pointer: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject) {
    const hit = this.viewOf(obj);
    if (!hit || !this.enabled) return;
    this.select(hit.id);
    this.draggingId = hit.id;
    // Tabletop pieces are drawn raised onto their table: their floor spot is the state position.
    const floor =
      hit.view.def.layer === "tabletop"
        ? { x: hit.view.state.x, y: hit.view.state.y }
        : { x: hit.view.container.x, y: hit.view.container.y };
    this.dragStart = { ...floor, rotation: hit.view.rotation };
    hit.view.dragFloor = hit.view.def.layer === "tabletop" ? { ...floor } : undefined;
    this.lastDragPointer = { x: pointer.x, y: pointer.y };
    hit.view.container.setDepth(UI_DEPTH - 1);
    // Gadgets standing on the dragged piece preview-follow it (the server moves them for real).
    this.draggingCarried = hit.view.def.surface
      ? piecesOnSurface(
          { id: hit.view.state.id, kind: hit.view.def.kind, x: hit.view.state.x, y: hit.view.state.y, rotation: hit.view.state.rotation },
          this.placed(),
        )
          .map((p) => this.views.get(p.id))
          .filter((v): v is DecorView => !!v)
      : [];
    for (const carried of this.draggingCarried) carried.container.setDepth(UI_DEPTH - 0.5);
    this.sellZone.setVisible(true);
  }

  private onDrag(pointer: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject, dragX: number, dragY: number) {
    const hit = this.viewOf(obj);
    if (!hit || this.draggingId !== hit.id) return;
    if (hit.view.def.layer === "tabletop") {
      // The cursor points at the drawn (raised) surface: add the surface height back to get floor coords.
      const at = this.tabletopFloorAt(dragX, dragY);
      hit.view.dragFloor = { x: at.x, y: at.y };
      hit.view.container.setPosition(at.x, at.y - at.h);
    } else {
      hit.view.container.setPosition(snapToGrid(dragX), snapToGrid(dragY));
      for (const carried of this.draggingCarried) this.syncSurfaceView(carried);
    }
    this.lastDragPointer = { x: pointer.x, y: pointer.y };
    this.previewDrag(hit.view, pointer.x, pointer.y);
  }

  /** Outline + floor shading for the piece being dragged. `pointerX/Y` = screen position (for the sell zone). */
  private previewDrag(view: DecorView, pointerX: number, pointerY: number) {
    // Tabletop pieces validate at their floor spot, not their raised drawn position.
    const at =
      view.def.layer === "tabletop" ? (view.dragFloor ?? { x: view.state.x, y: view.state.y }) : { x: view.container.x, y: view.container.y };
    const overSell = this.isOverSellZone(pointerX, pointerY);
    const ok = overSell || canPlaceDecoration(view.def.kind, at.x, at.y, this.placed(), view.state.id, view.rotation);
    view.outline.setVisible(true).setStrokeStyle(3, ok ? OK_COLOR : BAD_COLOR);
    this.showFootprint(view.def, view.rotation, at.x, at.y, ok, !overSell);
    this.sellZoneBg.setFillStyle(BAD_COLOR, overSell ? 0.4 : 0.18);
  }

  private onDragEnd(pointer: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject) {
    const hit = this.viewOf(obj);
    if (!hit || this.draggingId !== hit.id) return;
    const { id, view } = hit;
    const carried = this.draggingCarried;
    this.draggingId = null;
    this.draggingCarried = [];
    this.sellZone.setVisible(false);
    view.outline.setStrokeStyle(3, SELECT_COLOR); // stays selected for R / ⟳
    this.footprint.setVisible(false);

    if (this.isOverSellZone(pointer.x, pointer.y)) {
      this.room.send(Messages.SellDecoration, { id });
      return;
    }

    const tabletop = view.def.layer === "tabletop";
    const at = tabletop ? (view.dragFloor ?? { x: view.state.x, y: view.state.y }) : { x: view.container.x, y: view.container.y };
    const { rotation } = view;
    const changed = at.x !== this.dragStart.x || at.y !== this.dragStart.y || rotation !== this.dragStart.rotation;
    if (changed && canPlaceDecoration(view.def.kind, at.x, at.y, this.placed(), id, rotation)) {
      this.room.send(Messages.MoveDecoration, { id, x: at.x, y: at.y, rotation });
      this.scene.time.delayedCall(RESYNC_MS, () => {
        this.syncPosition(id);
        this.syncRotation(id);
        for (const c of carried) this.syncSurfaceView(c); // safety net if the server refused the batch
      });
      view.dragFloor = undefined;
      // Keep the predicted position until the server confirms (re-raising a tabletop piece would
      // snap it back to its old spot); regular pieces just take the depth of where they were dropped.
      if (!tabletop) this.applyDepth(view);
      return;
    }
    if (tabletop) this.syncSurfaceView(view);
    else view.container.setPosition(this.dragStart.x, this.dragStart.y);
    this.renderRotation(view, this.dragStart.rotation);
    for (const c of carried) this.syncSurfaceView(c);
    if (!tabletop) this.applyDepth(view);
  }

  /** (x, y) = screen position (the zone doesn't scroll with the camera). */
  private isOverSellZone(x: number, y: number) {
    const z = this.sellZone;
    return Math.abs(x - z.x) <= this.sellZoneBg.width / 2 && Math.abs(y - z.y) <= this.sellZoneBg.height / 2;
  }

  /** Redraw a placed piece turned to `rotation` (artwork, outline, hit area). */
  private renderRotation(view: DecorView, rotation: number) {
    if (view.rotation === rotation) return;
    view.rotation = rotation;
    for (const o of view.visual) o.destroy();
    const visual = buildDecorVisual(this.scene, view.def, rotation);
    view.visual = visual.objects;
    view.container.addAt(visual.objects, 0);
    const size = footprintOf(view.def, rotation);
    view.outline.setSize(size.width + 6, size.height + 6).setOrigin(0.5);
    view.container.setSize(visual.width, visual.halfHeight * 2);
    const hitArea = view.container.input?.hitArea as Phaser.Geom.Rectangle | undefined;
    hitArea?.setSize(visual.width, visual.halfHeight * 2);
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
    this.select(null);

    const size = footprintOf(def, 0);
    const outline = this.scene.add.rectangle(0, 0, size.width + 6, size.height + 6).setStrokeStyle(3, BAD_COLOR);
    const view = this.scene.add.container(-1000, -1000, [outline]).setDepth(UI_DEPTH).setVisible(false);
    this.ghost = { def, view, outline, visual: [], rotation: -1, lastClient: { x: event.clientX, y: event.clientY } };
    this.setGhostRotation(0);

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
      if (target?.ok && this.ghost) {
        this.room.send(Messages.BuyDecoration, { kind: def.kind, x: target.x, y: target.y, rotation: this.ghost.rotation });
      }
      this.cancelGhost();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    this.updateGhost(event.clientX, event.clientY);
  }

  private setGhostRotation(rotation: number) {
    const g = this.ghost;
    if (!g || g.rotation === rotation) return;
    g.rotation = rotation;
    for (const o of g.visual) o.destroy();
    g.visual = buildDecorVisual(this.scene, g.def, rotation, 0.8).objects;
    g.view.addAt(g.visual, 0);
    const size = footprintOf(g.def, rotation);
    g.outline.setSize(size.width + 6, size.height + 6).setOrigin(0.5);
  }

  private ghostTarget(clientX: number, clientY: number) {
    if (!this.ghost) return undefined;
    // Layout coordinates: phones held upright have the page turned (see forceLandscape.ts).
    const rect = layoutRect(this.scene.game.canvas);
    const p = toLayout(clientX, clientY);
    const inside = p.x >= rect.left && p.x <= rect.right && p.y >= rect.top && p.y <= rect.bottom;
    if (!inside) return undefined;
    // Screen -> world: the restaurant's camera may be scrolled.
    const cam = this.scene.cameras.main;
    const px = cam.scrollX + ((p.x - rect.left) / rect.width) * WORLD_WIDTH;
    const py = cam.scrollY + ((p.y - rect.top) / rect.height) * WORLD_HEIGHT;
    // A tabletop item's cursor points at the drawn (raised) surface: add the surface height back
    // to land on the floor coordinates the placement rules work with.
    const lift = this.ghost.def.layer === "tabletop" ? (this.surfaceAtPoint(px, py)?.height ?? 0) : 0;
    const x = snapToGrid(px);
    const y = snapToGrid(py + lift);
    return { x, y, lift, ok: canPlaceDecoration(this.ghost.def.kind, x, y, this.placed(), undefined, this.ghost.rotation) };
  }

  private updateGhost(clientX: number, clientY: number) {
    if (!this.ghost) return;
    this.ghost.lastClient = { x: clientX, y: clientY };
    const target = this.ghostTarget(clientX, clientY);
    this.ghost.view.setVisible(!!target);
    if (!target) return this.footprint.setVisible(false);
    this.ghost.view.setPosition(target.x, target.y - target.lift);
    this.ghost.outline.setStrokeStyle(3, target.ok ? OK_COLOR : BAD_COLOR);
    this.showFootprint(this.ghost.def, this.ghost.rotation, target.x, target.y, target.ok);
  }

  private cancelGhost() {
    this.ghost?.view.destroy();
    this.ghost = undefined;
    this.footprint?.setVisible(false);
  }

  // ---------------------------------------------------------------- Helpers

  /** Shade the floor under the piece being placed so its exact cells are visible. */
  private showFootprint(def: DecorationDef, rotation: number, x: number, y: number, ok: boolean, visible = true) {
    const size = footprintOf(def, rotation);
    this.footprint
      .setVisible(visible)
      .setPosition(x, y)
      .setSize(size.width, size.height)
      .setFillStyle(ok ? OK_COLOR : BAD_COLOR, 0.3);
    this.footprint.setOrigin(0.5); // keep it centred on (x, y) after resizing
  }

  /** Current furniture as the client sees it (used for placement preview). */
  private placed() {
    return [...this.views.entries()].map(([id, v]) => ({ id, kind: v.def.kind, x: v.state.x, y: v.state.y, rotation: v.state.rotation }));
  }

  private applyDepth(view: DecorView) {
    const { layer } = view.def;
    if (layer === "tabletop") {
      this.syncSurfaceView(view);
      return;
    }
    view.container.setDepth(layer === "floor" ? FLOOR_DEPTH : layer === "wall" ? WALL_DECOR_DEPTH : view.container.y);
  }

  /**
   * Place a tabletop piece: raised onto its supporting table's surface height and drawn just above
   * that table in depth. While the table itself is dragged, the piece previews the same offset,
   * above everything (the server sends a `moved` for it afterwards).
   */
  private syncSurfaceView(view: DecorView) {
    const table = surfaceUnder(view.def.kind, view.state.x, view.state.y, this.placed(), view.state.rotation);
    const tableView = table ? this.views.get(table.id) : undefined;
    const height = tableView?.def.surface?.height ?? 0;
    if (table && tableView && this.draggingId === table.id) {
      view.container.setPosition(
        view.state.x + (tableView.container.x - tableView.state.x),
        view.state.y + (tableView.container.y - tableView.state.y) - height,
      );
      view.container.setDepth(UI_DEPTH - 0.5);
      return;
    }
    view.container.setPosition(view.state.x, view.state.y - height);
    // Just above the table (its depth is its y), so a gadget never hides behind its own table.
    view.container.setDepth(tableView ? tableView.container.y + 1 : view.state.y);
  }

  /** The surface piece under a world point (its footprint contains the point). */
  private surfaceAtPoint(x: number, y: number): { id: string; height: number } | undefined {
    for (const p of this.placed()) {
      const def = getDecorationDef(p.kind);
      if (!def?.surface) continue;
      const size = footprintOf(def, normalizeRotation(def, p.rotation));
      if (Math.abs(x - p.x) <= size.width / 2 && Math.abs(y - p.y) <= size.height / 2) {
        return { id: p.id, height: def.surface.height };
      }
    }
    return undefined;
  }

  /**
   * Floor coordinates for a tabletop piece whose cursor sits at world (px, py): the cursor points at
   * the table's drawn surface (raised by its surface height), so add that height back to the y.
   */
  private tabletopFloorAt(px: number, py: number) {
    const h = this.surfaceAtPoint(px, py)?.height ?? 0;
    return { x: snapToGrid(px), y: snapToGrid(py + h), h };
  }

  /** Veil + cell grid over a box (a room's floor or wall). */
  private drawGrid(left: number, right: number, top: number, bottom: number) {
    this.grid.fillStyle(0xffffff, VEIL_ALPHA).fillRect(left, top, right - left, bottom - top);
    this.grid.lineStyle(1, 0x3d2c29, GRID_LINE_ALPHA);
    for (let x = left; x <= right; x += GRID_CELL) this.grid.lineBetween(x, top, x, bottom);
    for (let y = top; y <= bottom; y += GRID_CELL) this.grid.lineBetween(left, y, right, y);
  }
}
