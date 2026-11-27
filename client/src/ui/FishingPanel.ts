import type { Room } from "@colyseus/sdk";
import { Messages, getFish, getRod, type Area } from "@boba/shared";
import type { BobaShopState } from "@boba/shared/schema";

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = "") =>
  Object.assign(document.createElement(tag), { className, textContent: text });

/** How often the panel re-reads the state (clock, counters, reel bar, toasts). */
const UPDATE_MS = 100;
/** How long a catch / escape toast stays up. */
const TOAST_MS = 2400;

const formatClock = (seconds: number) => {
  const t = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

/**
 * Overlay on top of the game canvas while the local player is at the pond:
 * - HUD (#fishing-hud): session clock, own catch count and earnings, rod name + the upgrade button.
 * - #fishing-start / #fishing-summary: start the session, or its results once it ended.
 * - #fishing-reel: the reel bar while a fish is on the line — the progress fill, the moving safe
 *   zone (#reel-zone) and the tension pointer (#reel-marker) — with a hold button (Space works too).
 * - #fishing-toast: "a fish bit!" / "caught one!" / "it got away" flashes.
 * The panel itself sends StartFishing / UpgradeRod / Reel; the scene handles Cast / Retract.
 */
export class FishingPanel {
  private area: Area = "shop";
  /** True while the hold button is pressed (only Reel { holding } on change, like Space). */
  private holding = false;
  private lastCatchSeq = 0;
  private lastEscapeSeq = 0;
  /** Last hookState seen for the local player: a switch to "reel" means a fish bit. */
  private lastHookState = "";
  /** Last jerkSeq shown on the bar: a higher one means the fish just jerked the zone. */
  private lastJerkSeq = 0;
  private summaryKey = "";
  private toastTimer?: ReturnType<typeof setTimeout>;
  private readonly timer: ReturnType<typeof setInterval>;

  private readonly clockEl: HTMLElement;
  private readonly fishEl: HTMLElement;
  private readonly moneyEl: HTMLElement;
  private readonly rodEl: HTMLElement;
  private readonly upgradeBtn: HTMLButtonElement;
  private readonly startBtn: HTMLButtonElement;
  private readonly reelEl: HTMLElement;
  private readonly trackEl: HTMLElement;
  private readonly reelFill: HTMLElement;
  private readonly zoneEl: HTMLElement;
  private readonly markerEl: HTMLElement;
  private readonly holdBtn: HTMLButtonElement;
  private readonly summaryEl: HTMLElement;
  private readonly summaryList: HTMLElement;
  private readonly toastEl: HTMLElement;

  constructor(
    private readonly root: HTMLElement,
    private readonly room: Room<BobaShopState>,
  ) {
    const $ = (id: string) => {
      const node = el("div");
      node.id = id;
      return node;
    };

    // HUD: clock, catch, earnings, rod + upgrade.
    this.clockEl = el("span", "fh-clock", "⏱ 0:00");
    this.fishEl = el("span", "fh-catch", "🐟 0");
    this.moneyEl = el("span", "fh-money", "💰 $0");
    this.rodEl = el("span", "fh-rod", "🎣 Cần tre");
    this.upgradeBtn = el("button", "btn small") as HTMLButtonElement;
    this.upgradeBtn.id = "fishing-upgrade";
    this.upgradeBtn.type = "button";
    this.upgradeBtn.addEventListener("click", () => {
      this.room.send(Messages.UpgradeRod);
      this.upgradeBtn.blur(); // keep Space for the game
    });
    const hud = $("fishing-hud");
    hud.className = "fishing-hud";
    hud.append(this.clockEl, this.fishEl, this.moneyEl, this.rodEl, this.upgradeBtn);

    // Start button (shown while no session is running).
    this.startBtn = el("button", "btn fishing-start", "🎣 Bắt đầu câu") as HTMLButtonElement;
    this.startBtn.id = "fishing-start";
    this.startBtn.type = "button";
    this.startBtn.addEventListener("click", () => {
      this.room.send(Messages.StartFishing);
      this.startBtn.blur();
    });

    // The reel bar + hold button (touch-friendly; Space works too, see ShopScene). The track holds
    // the progress fill plus the safe-zone minigame: the green window (#reel-zone) and the tension
    // pointer (#reel-marker), both driven by the server's reel sim (see updateHookReel).
    this.reelFill = el("div", "reel-fill");
    this.zoneEl = $("reel-zone");
    this.markerEl = $("reel-marker");
    this.trackEl = el("div", "reel-track");
    this.trackEl.append(this.reelFill, this.zoneEl, this.markerEl);
    this.holdBtn = el("button", "btn small", "🤜 GIỮ để kéo") as HTMLButtonElement;
    this.holdBtn.id = "fishing-hold";
    this.holdBtn.type = "button";
    this.holdBtn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.holdBtn.setPointerCapture(e.pointerId);
      if (this.holding) return;
      this.holding = true;
      this.room.send(Messages.Reel, { holding: true });
    });
    const release = () => {
      if (!this.holding) return;
      this.holding = false;
      this.room.send(Messages.Reel, { holding: false });
    };
    this.holdBtn.addEventListener("pointerup", release);
    this.holdBtn.addEventListener("pointercancel", release);
    this.holdBtn.addEventListener("lostpointercapture", release);
    this.reelEl = $("fishing-reel");
    this.reelEl.className = "fishing-reel";
    this.reelEl.append(this.trackEl, this.holdBtn);

    // Session summary (fishPhase "ended"): everyone's catch, then fish again.
    this.summaryList = el("ul", "stats");
    const again = el("button", "btn", "🔁 Câu tiếp") as HTMLButtonElement;
    again.id = "fishing-again";
    again.type = "button";
    again.addEventListener("click", () => {
      this.room.send(Messages.StartFishing);
      again.blur();
    });
    this.summaryEl = $("fishing-summary");
    this.summaryEl.className = "fish-card";
    this.summaryEl.append(el("h2", "", "🏁 Hết phiên câu!"), this.summaryList, again);

    this.toastEl = $("fishing-toast");
    this.toastEl.className = "fishing-toast";
    this.toastEl.hidden = true;

    this.root.replaceChildren(hud, this.startBtn, this.reelEl, this.summaryEl, this.toastEl);
    this.timer = setInterval(() => this.update(), UPDATE_MS);
  }

  destroy() {
    clearInterval(this.timer);
    clearTimeout(this.toastTimer);
    this.root.hidden = true;
    this.root.replaceChildren();
  }

  /** The local player moved: the panel only lives at the pond. */
  setArea(area: Area) {
    this.area = area;
    this.root.hidden = area !== "pond";
    if (area !== "pond") {
      this.holding = false; // our hold can't matter outside the pond
      return;
    }
    // Coming back: don't replay old toasts.
    const me = this.room.state.players.get(this.room.sessionId);
    this.lastCatchSeq = me?.catchSeq ?? 0;
    this.lastEscapeSeq = me?.escapeSeq ?? 0;
    this.lastHookState = me?.hookState ?? "";
    this.lastJerkSeq = me?.jerkSeq ?? 0;
    this.update();
  }

  private update() {
    if (this.area !== "pond") return;
    const state = this.room.state;
    const me = state.players.get(this.room.sessionId);
    if (!me) return;

    this.clockEl.textContent = `⏱ ${formatClock(state.fishTimeLeft)}`;
    this.fishEl.textContent = `🐟 ${me.fishCaught}`;
    this.moneyEl.textContent = `💰 $${me.fishEarned}`;
    this.rodEl.textContent = `🎣 ${getRod(me.rodLevel)?.name ?? "Cần tre"}`;

    const next = getRod(me.rodLevel + 1);
    if (!next) {
      this.upgradeBtn.disabled = true;
      this.upgradeBtn.textContent = "🏆 Cần tối đa";
      this.upgradeBtn.title = "Bạn đã có cần câu cao cấp nhất rồi";
    } else {
      this.upgradeBtn.textContent = `⬆ ${next.name} · $${next.price}`;
      this.upgradeBtn.disabled = me.money < next.price;
      this.upgradeBtn.title = me.money < next.price ? `Không đủ tiền (cần $${next.price})` : `Nâng cấp lên ${next.name}`;
    }

    this.startBtn.hidden = state.fishPhase === "fishing";
    this.summaryEl.hidden = state.fishPhase !== "ended";
    if (!this.summaryEl.hidden) this.updateSummary(state);

    this.reelEl.hidden = me.hookState !== "reel";
    if (this.reelEl.hidden) {
      this.trackEl.classList.remove("reel-jerk");
    } else {
      this.reelFill.style.width = `${Math.round(Math.min(1, Math.max(0, me.reelProgress)) * 100)}%`;
      // Safe-zone minigame: the green window and the pointer, placed as % of the track.
      const width = Math.min(1, Math.max(0, me.zoneWidth));
      const center = Math.min(1 - width / 2, Math.max(width / 2, me.zoneCenter));
      this.zoneEl.style.left = `${Math.round((center - width / 2) * 100)}%`;
      this.zoneEl.style.width = `${Math.round(width * 100)}%`;
      this.markerEl.style.left = `${Math.round(Math.min(1, Math.max(0, me.reelPos)) * 100)}%`;
      if (me.jerkSeq > this.lastJerkSeq) this.jerk();
      this.lastJerkSeq = me.jerkSeq;
    }
    // The fish got away / was landed: the hold button releases with it.
    if (me.hookState !== "reel") this.holding = false;

    if (me.catchSeq !== this.lastCatchSeq) {
      this.lastCatchSeq = me.catchSeq;
      const def = getFish(me.lastCatch);
      this.toast(`🎉 Bắt được: ${def?.name ?? "cá gì đó"} +$${def?.price ?? 0}`);
    }
    if (me.escapeSeq !== this.lastEscapeSeq) {
      this.lastEscapeSeq = me.escapeSeq;
      this.toast("💦 Cá kéo thoát mất rồi!");
    }
    if (me.hookState !== this.lastHookState) {
      this.lastHookState = me.hookState;
      if (me.hookState === "reel") this.toast("❗ Cá cắn câu! Giữ để kéo, giữ con trỏ trong vùng xanh");
    }
  }

  /** The fish just jerked the safe zone elsewhere: shake the bar briefly (see jerkSeq). */
  private jerk() {
    this.trackEl.classList.remove("reel-jerk");
    void this.trackEl.offsetWidth; // reflow so a running shake restarts right away
    this.trackEl.classList.add("reel-jerk");
  }

  /** Everyone's catch + earnings and each one's priciest fish (rebuilt only when the numbers change). */
  private updateSummary(state: BobaShopState) {
    const rows: string[] = [];
    for (const [sessionId, player] of state.players.entries()) {
      const me = sessionId === this.room.sessionId;
      rows.push(`${me ? "🫵 Bạn" : `👤 ${player.name}`}: ${player.fishCaught} con · $${player.fishEarned}`);
      const best = getFish(player.bestCatch);
      rows.push(`🏆 Cá to nhất: ${best ? `${best.name} ($${best.price})` : "chưa bắt được con nào"}`);
    }
    const key = rows.join("|");
    if (key === this.summaryKey) return;
    this.summaryKey = key;
    this.summaryList.replaceChildren(...rows.map((row) => el("li", "", row)));
  }

  private toast(text: string) {
    this.toastEl.textContent = text;
    this.toastEl.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toastEl.hidden = true), TOAST_MS);
  }
}
