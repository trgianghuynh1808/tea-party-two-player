// Phones always play in landscape.
// - Where the browser allows it (Android Chrome...), the first tap goes fullscreen and locks the screen to landscape.
// - Otherwise (iPhone Safari has no orientation lock), a phone held upright gets the whole page turned 90° with CSS
//   (body.force-landscape), so it reads as landscape once the phone is turned. The browser hit-tests DOM elements
//   through the transform by itself; Phaser and our own clientX/Y maths don't, so they go through toLayout/layoutRect.
//
// The turn: rotate(90deg) translateY(-100%) around the top-left corner. A layout point (lx, ly) shows on screen at
// (screenWidth - ly, lx), so a screen point (sx, sy) is the layout point (sy, screenWidth - sx).

import type Phaser from "phaser";
import { isTouchDevice } from "./input/TouchControls";

const ROTATED_CLASS = "force-landscape";

let rotated = false;

/** True while the page is turned with CSS (phone held upright). */
export const isPageRotated = () => rotated;

/** Screen (client) coordinates -> page layout coordinates (identity unless the page is turned). */
export function toLayout(clientX: number, clientY: number): { x: number; y: number } {
  return rotated ? { x: clientY, y: window.innerWidth - clientX } : { x: clientX, y: clientY };
}

/** An element's box in page layout coordinates (getBoundingClientRect gives the turned box while rotated). */
export function layoutRect(el: Element): { left: number; top: number; width: number; height: number; right: number; bottom: number } {
  const r = el.getBoundingClientRect();
  if (!rotated) return { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
  const left = r.top;
  const top = window.innerWidth - r.right;
  return { left, top, width: r.height, height: r.width, right: left + r.height, bottom: top + r.width };
}

function update() {
  const portrait = window.innerHeight > window.innerWidth;
  const next = isTouchDevice() && portrait;
  const style = document.documentElement.style;
  style.setProperty("--screen-w", `${window.innerWidth}px`);
  style.setProperty("--screen-h", `${window.innerHeight}px`);
  if (next === rotated) return;
  rotated = next;
  document.documentElement.classList.toggle(ROTATED_CLASS, rotated);
  document.body.classList.toggle(ROTATED_CLASS, rotated);
  window.dispatchEvent(new Event("page-rotation"));
}

/** First tap on a phone: fullscreen + landscape lock, where supported (needs a user gesture). */
async function lockLandscape() {
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    }
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    await orientation.lock?.("landscape");
  } catch {
    /* not supported (iPhone): the CSS turn covers it */
  }
}

export function initForceLandscape() {
  if (!isTouchDevice()) return;
  update();
  window.addEventListener("resize", update);
  window.addEventListener("orientationchange", () => setTimeout(update, 100));
  // Inputs keep their own taps: going fullscreen while the keyboard opens would close it.
  const onFirstTap = (e: PointerEvent) => {
    if ((e.target as HTMLElement | null)?.closest("input, textarea, select")) return;
    window.removeEventListener("pointerup", onFirstTap, true);
    void lockLandscape();
  };
  window.addEventListener("pointerup", onFirstTap, true);
}

/** Make Phaser size its canvas and read touches in layout coordinates while the page is turned. */
export function patchPhaserForRotation(game: Phaser.Game) {
  const scale = game.scale as Phaser.Scale.ScaleManager & {
    getParentBounds: () => boolean;
    updateBounds: () => void;
    updateCenter: () => void;
    parentSize: Phaser.Structs.Size;
    canvasBounds: Phaser.Geom.Rectangle;
    parentIsWindow: boolean;
  };
  const originalParentBounds = scale.getParentBounds.bind(scale);
  scale.getParentBounds = () => {
    if (!rotated || !scale.parent || scale.parentIsWindow) return originalParentBounds();
    const r = layoutRect(scale.parent as Element);
    if (scale.parentSize.width === r.width && scale.parentSize.height === r.height) return false;
    scale.parentSize.setSize(r.width, r.height);
    return true;
  };
  const originalUpdateBounds = scale.updateBounds.bind(scale);
  scale.updateBounds = () => {
    if (!rotated) return originalUpdateBounds();
    const r = layoutRect(scale.canvas);
    scale.canvasBounds.setTo(r.left, r.top, r.width, r.height);
  };

  // Centring measures the canvas too (same swap): FIT never changes the aspect, so centre with the layout box.
  const originalUpdateCenter = scale.updateCenter.bind(scale);
  scale.updateCenter = () => {
    if (!rotated || scale.autoCenter === 0) return originalUpdateCenter();
    const r = layoutRect(scale.canvas);
    const style = scale.canvas.style;
    style.marginLeft = `${Math.floor((scale.parentSize.width - r.width) / 2)}px`;
    style.marginTop = `${Math.floor((scale.parentSize.height - r.height) / 2)}px`;
  };

  const input = game.input as Phaser.Input.InputManager & {
    transformPointer: (pointer: Phaser.Input.Pointer, pageX: number, pageY: number, wasMove: boolean) => void;
  };
  const originalTransform = input.transformPointer.bind(input);
  input.transformPointer = (pointer, pageX, pageY, wasMove) => {
    // The page doesn't scroll in game, so page coordinates are client coordinates.
    const p = toLayout(pageX, pageY);
    originalTransform(pointer, p.x, p.y, wasMove);
  };

  window.addEventListener("page-rotation", () => scale.refresh());
  // Phaser may already have measured its parent while booting (it boots right away once the DOM is ready).
  scale.refresh();
}
