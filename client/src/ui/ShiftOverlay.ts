import { Callbacks, type Room } from "@colyseus/sdk";
import { GamePhase, MISSED_ORDER_PENALTY, Messages, SHIFT_SECONDS, STAR_THRESHOLDS, starsFor } from "@boba/shared";
import type { BobaShopState } from "@boba/shared/schema";

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = "") =>
  Object.assign(document.createElement(tag), { className, textContent: text });

/**
 * Overlay on top of the game canvas:
 * - Waiting: shift intro + "Bắt đầu ca" button (players can still walk around and practice behind it).
 * - Ended: star rating and shift stats + "Chơi ca mới" button.
 * Hidden while a shift is being played.
 */
export class ShiftOverlay {
  private unsubscribers: (() => void)[] = [];
  private collapsed = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly room: Room<BobaShopState>,
  ) {
    const $ = Callbacks.get(room);
    const render = () => this.render();
    this.unsubscribers.push(
      $.listen("phase", () => {
        this.collapsed = false;
        render();
      }),
      $.onAdd("players", (player) => {
        render();
        this.unsubscribers.push($.listen(player, "shiftShare", render));
      }),
      $.onRemove("players", render),
    );
  }

  destroy() {
    this.unsubscribers.forEach((off) => off());
    this.root.hidden = true;
    this.root.replaceChildren();
  }

  /** Shrink the card to the small "show" button (e.g. so the shop is visible while decorating). */
  collapse() {
    if (this.collapsed) return;
    this.collapsed = true;
    this.render();
  }

  private render() {
    const state = this.room.state;
    const phase = state.phase as GamePhase;
    this.root.hidden = phase === GamePhase.Playing;
    if (this.root.hidden) return;

    const card = el("div", "shift-card");
    if (phase === GamePhase.Ended) this.renderResults(card, state);
    else this.renderWaiting(card, state);

    // Let players hide the card to look at / walk around the shop.
    this.root.classList.toggle("collapsed", this.collapsed);
    this.root.replaceChildren(this.collapsed ? this.expandButton() : card);
  }

  private renderWaiting(card: HTMLElement, state: BobaShopState) {
    const players = state.players.size;
    card.append(
      el("h2", "", "☀️ Sẵn sàng mở quán?"),
      el("p", "", `Ca làm việc dài ${SHIFT_SECONDS / 60} phút. Pha đúng món khách gọi trước khi họ bỏ về.`),
      el(
        "p",
        "hint",
        `Càng về cuối ca khách càng đông và ít kiên nhẫn. Khách bỏ về: −$${MISSED_ORDER_PENALTY} và mất combo. ` +
          "Ly để quên trên máy sẽ bị tràn. Coi chừng khách 👑 VIP, 🧐 khó tính và 👨‍👩‍👧 nhóm!",
      ),
      el(
        "p",
        "hint",
        `Quán dùng nội thất của ${state.hostName || "chủ phòng"}. Hết ca, doanh thu chia đều cho mọi người trong phòng (rời phòng giữa ca thì không được chia).`,
      ),
      el("p", "hint", `Mục tiêu: ⭐ $${STAR_THRESHOLDS[0]} · ⭐⭐ $${STAR_THRESHOLDS[1]} · ⭐⭐⭐ $${STAR_THRESHOLDS[2]}`),
      el(
        "p",
        players >= 2 ? "ready" : "hint",
        players >= 2 ? "✅ Đủ 2 người rồi!" : "Đang chờ người chơi thứ 2... (vẫn có thể chơi 1 mình)",
      ),
      this.actions("Bắt đầu ca"),
    );
  }

  private renderResults(card: HTMLElement, state: BobaShopState) {
    const stars = starsFor(state.shiftEarnings);
    const starRow = el("div", "stars");
    for (let i = 0; i < 3; i++) starRow.append(el("span", i < stars ? "on" : "off", "★"));

    const next = STAR_THRESHOLDS.find((t) => state.shiftEarnings < t);
    const stats = el("ul", "stats");
    stats.append(
      el("li", "", `💰 Doanh thu ca: $${state.shiftEarnings}`),
      el("li", "", `🧋 Đã giao: ${state.servedCount} ly`),
      el("li", "", `😤 Khách bỏ về: ${state.missedCount}${state.missedCount ? ` (−$${state.missedCount * MISSED_ORDER_PENALTY})` : ""}`),
      el("li", "", `🔥 Combo cao nhất: ${state.bestCombo}`),
    );

    // Each player's part of the split (already added to their wallet by the server).
    const shares = el("ul", "stats");
    state.players.forEach((player, sessionId) => {
      const me = sessionId === this.room.sessionId;
      const amount = player.shiftShare >= 0 ? `+$${player.shiftShare}` : `−$${-player.shiftShare}`;
      shares.append(el("li", "", `${me ? "🫵 Bạn" : `👤 ${player.name}`}: ${amount} → ví $${player.money}`));
    });

    card.append(
      el("h2", "", stars === 3 ? "🎉 Ca làm tuyệt vời!" : stars > 0 ? "Hết ca rồi!" : "Hết ca... cố lên lần sau!"),
      starRow,
      stats,
      el("p", "", `👥 Chia đều cho ${state.players.size} người:`),
      shares,
      el("p", "hint", next ? `Cần $${next - state.shiftEarnings} nữa để lên ${stars + 1} sao` : "Đạt tối đa 3 sao!"),
      this.actions("Chơi ca mới"),
    );
  }

  private actions(startLabel: string): HTMLElement {
    const row = el("div", "actions");
    const start = el("button", "btn primary", startLabel);
    start.type = "button";
    start.addEventListener("click", () => {
      start.disabled = true;
      start.blur(); // keep Space from re-clicking the button while playing
      this.room.send(Messages.StartShift);
    });

    const hide = el("button", "btn ghost-dark", "Ẩn bảng");
    hide.type = "button";
    hide.addEventListener("click", () => {
      this.collapsed = true;
      this.render();
    });

    row.append(start, hide);
    return row;
  }

  private expandButton(): HTMLElement {
    const btn = el("button", "btn small", "Hiện bảng ca làm");
    btn.type = "button";
    btn.addEventListener("click", () => {
      this.collapsed = false;
      btn.blur();
      this.render();
    });
    return btn;
  }
}
