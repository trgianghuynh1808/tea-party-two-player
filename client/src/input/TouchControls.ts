import Phaser from "phaser";

/** Fraction of the joystick radius below which the stick counts as centered. */
const DEAD_ZONE = 0.3;
const STICK_RADIUS = 60;
const KNOB_RADIUS = 26;
const BUTTON_RADIUS = 52;
const UI_DEPTH = 20000;

/** `?touch=1` forces touch controls on (handy for testing on a laptop with a mouse). */
export const FORCE_TOUCH_PARAM = "touch";

// Evaluated once at page load: the URL is rewritten later (?room=...), so it must not be re-read.
const TOUCH_DEVICE =
  new URLSearchParams(location.search).get(FORCE_TOUCH_PARAM) === "1" ||
  window.matchMedia("(pointer: coarse)").matches ||
  navigator.maxTouchPoints > 0;

/** Data key marking on-screen buttons: touches on them don't start the joystick or a build drag. */
export const SCREEN_UI = "screen-ui";
export const isScreenUi = (over: Phaser.GameObjects.GameObject[]) => over.some((o) => o.getData?.(SCREEN_UI));

/** True on phones/tablets (or when forced with ?touch=1). */
export function isTouchDevice(): boolean {
  return TOUCH_DEVICE;
}

/**
 * On-screen controls for touch devices:
 * - Floating joystick: touch anywhere on the left half to spawn it under your thumb.
 *   Output is snapped to 8 directions (-1/0/1 per axis) to match the movement protocol.
 * - Action button (bottom right) = Space. Its label previews what the action will do.
 */
export class TouchControls {
  /** Current joystick direction, each axis in {-1, 0, 1}. */
  dx = 0;
  dy = 0;

  private joystickPointerId: number | null = null;
  private origin = new Phaser.Math.Vector2();
  private readonly base: Phaser.GameObjects.Arc;
  private readonly knob: Phaser.GameObjects.Arc;
  private readonly button: Phaser.GameObjects.Arc;
  private readonly buttonLabel: Phaser.GameObjects.Text;
  private actionQueued = false;
  private enabled = true;

  constructor(private readonly scene: Phaser.Scene) {
    // Joystick + button can be held at the same time: allow 2 extra touch pointers.
    scene.input.addPointer(2);

    this.base = scene.add.circle(0, 0, STICK_RADIUS, 0x3d2c29, 0.18).setStrokeStyle(3, 0x3d2c29, 0.4);
    this.knob = scene.add.circle(0, 0, KNOB_RADIUS, 0xffffff, 0.85).setStrokeStyle(3, 0x3d2c29, 0.6);
    this.setStickVisible(false);

    const { width, height } = scene.scale;
    const bx = width - BUTTON_RADIUS - 28;
    const by = height - BUTTON_RADIUS - 56;
    this.button = scene.add
      .circle(bx, by, BUTTON_RADIUS, 0xe76f51, 0.92)
      .setStrokeStyle(4, 0xffffff, 0.9)
      .setInteractive({ useHandCursor: true });
    this.buttonLabel = scene.add
      .text(bx, by, "", {
        fontFamily: "sans-serif",
        fontSize: "18px",
        fontStyle: "bold",
        color: "#ffffff",
        align: "center",
        wordWrap: { width: BUTTON_RADIUS * 1.7 },
      })
      .setOrigin(0.5);

    // Screen-space UI: stays put while the camera scrolls around the yard.
    for (const o of [this.base, this.knob, this.button, this.buttonLabel]) o.setDepth(UI_DEPTH).setScrollFactor(0);

    this.button.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
      this.actionQueued = true;
      this.button.setScale(0.92);
      if ("vibrate" in navigator) navigator.vibrate?.(10);
    });
    const release = () => this.button.setScale(1);
    this.button.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, release);
    this.button.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, release);

    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this);
    scene.game.events.on(Phaser.Core.Events.BLUR, this.reset, this);
  }

  /** True once per tap on the action button (consumed on read). */
  consumeAction(): boolean {
    const hit = this.actionQueued;
    this.actionQueued = false;
    return hit;
  }

  /** Update the action button: label of what Space would do, dimmed when nothing is possible. */
  setAction(label: string | null) {
    this.buttonLabel.setText(label ?? "•••");
    this.button.setAlpha(label ? 0.92 : 0.45);
    this.buttonLabel.setAlpha(label ? 1 : 0.7);
  }

  /** Disable while the screen is used for something else (e.g. dragging furniture). */
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.button.setVisible(enabled);
    this.buttonLabel.setVisible(enabled);
    if (!enabled) this.reset();
  }

  destroy() {
    this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this);
    this.scene.game.events.off(Phaser.Core.Events.BLUR, this.reset, this);
  }

  private onPointerDown(pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) {
    if (!this.enabled || this.joystickPointerId !== null) return;
    if (over.includes(this.button) || isScreenUi(over)) return;
    if (pointer.x > this.scene.scale.width / 2) return;

    this.joystickPointerId = pointer.id;
    this.origin.set(pointer.x, pointer.y);
    this.base.setPosition(pointer.x, pointer.y);
    this.knob.setPosition(pointer.x, pointer.y);
    this.setStickVisible(true);
  }

  private onPointerMove(pointer: Phaser.Input.Pointer) {
    if (pointer.id !== this.joystickPointerId) return;

    const offset = new Phaser.Math.Vector2(pointer.x - this.origin.x, pointer.y - this.origin.y);
    const dist = offset.length();
    if (dist > STICK_RADIUS) offset.scale(STICK_RADIUS / dist);
    this.knob.setPosition(this.origin.x + offset.x, this.origin.y + offset.y);

    if (dist < STICK_RADIUS * DEAD_ZONE) {
      this.dx = 0;
      this.dy = 0;
      return;
    }
    // Snap to one of 8 directions (45° sectors).
    const sector = Math.round(Math.atan2(offset.y, offset.x) / (Math.PI / 4));
    const angle = sector * (Math.PI / 4);
    this.dx = Math.round(Math.cos(angle));
    this.dy = Math.round(Math.sin(angle));
  }

  private onPointerUp(pointer: Phaser.Input.Pointer) {
    if (pointer.id === this.joystickPointerId) this.reset();
  }

  private reset() {
    this.joystickPointerId = null;
    this.dx = 0;
    this.dy = 0;
    this.setStickVisible(false);
    this.button.setScale(1);
  }

  private setStickVisible(visible: boolean) {
    this.base.setVisible(visible);
    this.knob.setVisible(visible);
  }
}
