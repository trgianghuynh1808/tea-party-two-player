/**
 * Keyboard tracking based on `KeyboardEvent.code` (physical key position).
 *
 * Phaser 3 matches keys by the legacy `keyCode`, which becomes 229 while an IME
 * (e.g. Vietnamese Telex/VNI via Unikey, EVKey or macOS input sources) is composing.
 * Keys like D, W, S are composition keys in Telex, so Phaser would miss them.
 * `code` is layout- and IME-independent, so it always reports the physical key.
 */
export class KeyboardState {
  private down = new Set<string>();
  private pressed = new Set<string>();

  constructor(private readonly preventDefaultCodes: string[] = []) {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
  }

  /** True while any of the given physical keys is held. */
  isDown(...codes: string[]): boolean {
    return codes.some((c) => this.down.has(c));
  }

  /** True once per physical key press (consumed on read). */
  justPressed(code: string): boolean {
    const hit = this.pressed.has(code);
    this.pressed.delete(code);
    return hit;
  }

  destroy() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.preventDefaultCodes.includes(e.code)) e.preventDefault();
    if (!e.repeat && !this.down.has(e.code)) this.pressed.add(e.code);
    this.down.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.down.delete(e.code);
  };

  // Releasing keys while the window is unfocused never fires keyup; avoid stuck movement.
  private onBlur = () => {
    this.down.clear();
    this.pressed.clear();
  };
}
