// Shared rotate UI for the decorate and build panels (build parity with decorate):
// both panels use the same ⟳ Xoay (R) button and the same ⟳ badge on rotatable cards.

/**
 * The ⟳ Xoay (R) button. pointerdown + preventDefault: works while another finger drags,
 * and doesn't steal focus from the game.
 */
export function makeRotateButton(onRotate: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn rotate-btn";
  btn.textContent = "⟳ Xoay (R)";
  btn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    onRotate();
  });
  return btn;
}

/** ⟳ badge on a card whose item can turn; also marks it in the card's tooltip. */
export function addRotateBadge(el: HTMLElement, rotatable: boolean): void {
  if (!rotatable) return;
  el.title += " · Xoay được (R)";
  const badge = document.createElement("span");
  badge.className = "rotate-badge";
  badge.textContent = "⟳";
  badge.dataset.rotatable = "1";
  el.append(badge);
}
