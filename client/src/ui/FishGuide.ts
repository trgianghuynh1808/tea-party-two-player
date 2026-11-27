import type { Room } from "@colyseus/sdk";
import { FISH, FISH_TIERS, RODS, TIER_LABELS, parseCaught, type Area } from "@boba/shared";
import type { BobaShopState } from "@boba/shared/schema";

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = "") =>
  Object.assign(document.createElement(tag), { className, textContent: text });

/** How often the guide re-reads the player's rod level and caught log (marks follow upgrades / catches). */
const UPDATE_MS = 300;

/**
 * Sidebar section while the local player is at the pond: every fish species grouped by
 * rarity (icon + name + price; caught species marked with their catch count), then every rod
 * (name, price, reel speed) with the one the player owns highlighted. Read-only, all data
 * from shared/src/fishing.ts.
 */
export class FishGuide {
  private area: Area = "shop";
  /** Fish rows by species id: the row and its catch-count span (see update). */
  private readonly fishRows = new Map<string, { row: HTMLElement; count: HTMLElement }>();
  private readonly rodRows = new Map<number, HTMLElement>();
  /** "Đã bắt X/Y loài" line inside the fish title (see update). */
  private readonly progress = el("span", "fish-guide-progress");
  private readonly timer: ReturnType<typeof setInterval>;

  constructor(
    private readonly root: HTMLElement,
    private readonly room: Room<BobaShopState>,
  ) {
    this.root.classList.add("fish-guide");

    const fishSection = el("section");
    fishSection.dataset.testid = "fish-guide-fish";
    this.progress.dataset.testid = "fish-guide-progress";
    this.progress.textContent = `Đã bắt 0/${FISH.length} loài`;
    const fishTitle = el("h2", "", "🐟 Các loại cá");
    fishTitle.append(this.progress);
    fishSection.append(fishTitle);
    for (const tier of FISH_TIERS) {
      const tierFish = FISH.filter((f) => f.tier === tier);
      if (!tierFish.length) continue;
      fishSection.append(el("h3", "fish-guide-tier", TIER_LABELS[tier]));
      for (const fish of tierFish) {
        const row = el("div", "fish-guide-row");
        row.dataset.fish = fish.id;
        const icon = el("img", "fish-guide-icon");
        icon.src = `assets/fish/${fish.id}.png`;
        icon.alt = "";
        const count = el("span", "fish-guide-count");
        row.append(icon, el("span", "fish-guide-name", fish.name), el("span", "fish-guide-price", `$${fish.price}`), count);
        this.fishRows.set(fish.id, { row, count });
        fishSection.append(row);
      }
    }

    const rodSection = el("section");
    rodSection.dataset.testid = "fish-guide-rods";
    rodSection.append(el("h2", "", "🎣 Các loại cần câu"));
    for (const rod of RODS) {
      const price = rod.price ? `$${rod.price}` : "Miễn phí";
      const row = el("div", "fish-guide-row");
      row.dataset.rod = String(rod.level);
      row.append(el("span", "fish-guide-name", rod.name), el("span", "fish-guide-price", `${price} · kéo x${rod.reel.toFixed(1)}`));
      this.rodRows.set(rod.level, row);
      rodSection.append(row);
    }

    this.root.replaceChildren(fishSection, rodSection);
    this.timer = setInterval(() => this.update(), UPDATE_MS);
  }

  destroy() {
    clearInterval(this.timer);
    this.root.hidden = true;
    this.root.replaceChildren();
  }

  /** The local player moved: the guide only lives at the pond. */
  setArea(area: Area) {
    this.area = area;
    this.root.hidden = area !== "pond";
    if (area === "pond") this.update();
  }

  private update() {
    if (this.area !== "pond") return;
    const player = this.room.state.players.get(this.room.sessionId);
    const level = player?.rodLevel ?? 1;
    for (const [rodLevel, row] of this.rodRows) {
      if (rodLevel === level) row.dataset.current = "true";
      else delete row.dataset.current;
    }
    // Caught-species log ("sổ cá") of the local player: mark each species row with its catch
    // count; uncaught rows lose the mark (CSS dims their icon).
    const caught = parseCaught(player?.caughtLog ?? "");
    let caughtCount = 0;
    for (const [id, { row, count }] of this.fishRows) {
      const times = caught[id];
      if (times) {
        caughtCount++;
        row.dataset.caught = "true";
        count.textContent = `×${times}`;
      } else {
        delete row.dataset.caught;
        count.textContent = "";
      }
    }
    this.progress.textContent = `Đã bắt ${caughtCount}/${FISH.length} loài`;
  }
}
