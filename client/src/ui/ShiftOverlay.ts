import { Callbacks, type Room } from "@colyseus/sdk";
import {
  GamePhase,
  MISSED_ORDER_PENALTY,
  Messages,
  VENUES,
  getVenue,
  venueStars,
  type StartShiftMessage,
  type Venue,
  type VenueDef,
} from "@boba/shared";
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
  /** Venue suggested first: where the local player is standing (the restaurant, or else the tea shop). */
  private here: Venue = "shop";

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

  /** The local player moved to another area: offer to open the place they're in first. */
  setArea(area: string) {
    const here: Venue = area === "restaurant" ? "restaurant" : area === "shop" ? "shop" : this.here;
    if (here === this.here) return;
    this.here = here;
    this.render();
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
      el("p", "", "Chọn nơi mở ca, làm đúng món khách gọi trước khi họ bỏ về."),
      ...Object.values(VENUES).map((v) => el("p", "hint", `${v.icon} ${v.name}: ${v.shiftSeconds / 60} phút · ${goals(v)}`)),
      el(
        "p",
        "hint",
        `Càng về cuối ca khách càng đông và ít kiên nhẫn. Khách bỏ về: −$${MISSED_ORDER_PENALTY} và mất combo. ` +
          "Ly để quên trên máy sẽ bị tràn, đồ ăn để quên trên bếp sẽ cháy. Coi chừng khách 👑 VIP, 🧐 khó tính và 👨‍👩‍👧 nhóm!",
      ),
      el(
        "p",
        "hint",
        `Quán dùng nội thất của ${state.hostName || "chủ phòng"}. Hết ca, doanh thu chia đều cho mọi người trong phòng (rời phòng giữa ca thì không được chia).`,
      ),
      el(
        "p",
        players >= 2 ? "ready" : "hint",
        players >= 2 ? "✅ Đủ 2 người rồi!" : "Đang chờ người chơi thứ 2... (vẫn có thể chơi 1 mình)",
      ),
      this.actions("Bắt đầu ca"),
    );
  }

  private renderResults(card: HTMLElement, state: BobaShopState) {
    const venue = getVenue(state.venue);
    const stars = venueStars(venue.id, state.shiftEarnings);
    const starRow = el("div", "stars");
    for (let i = 0; i < 3; i++) starRow.append(el("span", i < stars ? "on" : "off", "★"));

    const next = venue.stars.find((t) => state.shiftEarnings < t);
    const stats = el("ul", "stats");
    stats.append(
      el("li", "", `💰 Doanh thu ca: $${state.shiftEarnings}`),
      el("li", "", `${venue.icon} Đã giao: ${state.servedCount} ${venue.unit}`),
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
      el("h2", "", `${venue.icon} ${stars === 3 ? "Ca làm tuyệt vời!" : stars > 0 ? "Hết ca rồi!" : "Hết ca... cố lên lần sau!"}`),
      starRow,
      stats,
      el("p", "", `👥 Chia đều cho ${state.players.size} người:`),
      shares,
      el("p", "hint", next ? `Cần $${next - state.shiftEarnings} nữa để lên ${stars + 1} sao` : "Đạt tối đa 3 sao!"),
      this.actions("Chơi ca mới"),
    );
  }

  /** One start button per venue, the one the player is standing in first. */
  private actions(startLabel: string): HTMLElement {
    const row = el("div", "actions");
    const venues = Object.values(VENUES).sort((a, b) => Number(b.id === this.here) - Number(a.id === this.here));
    const buttons = venues.map((v) => {
      const start = el("button", v.id === this.here ? "btn primary" : "btn", `${v.icon} ${startLabel}: ${v.name}`);
      start.type = "button";
      start.addEventListener("click", () => {
        for (const b of buttons) b.disabled = true;
        start.blur(); // keep Space from re-clicking the button while playing
        const message: StartShiftMessage = { venue: v.id };
        this.room.send(Messages.StartShift, message);
      });
      return start;
    });
    row.append(...buttons);

    const hide = el("button", "btn ghost-dark", "Ẩn bảng");
    hide.type = "button";
    hide.addEventListener("click", () => {
      this.collapsed = true;
      this.render();
    });

    row.append(hide);
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

const goals = (v: VenueDef) => `mục tiêu ⭐ $${v.stars[0]} · ⭐⭐ $${v.stars[1]} · ⭐⭐⭐ $${v.stars[2]}`;
