// The fishing pond: fish species, rods and reel maths, shared by the server (simulation) and the
// client (labels, colors). Balancing numbers live here so both sides agree (see the task file).

/** Rarity rank of a fish, common → mythic. Order matches the rods' bite tables. */
export type FishTier = "common" | "uncommon" | "rare" | "epic" | "mythic";

/** Tier order used by rod bite tables and drawings. */
export const FISH_TIERS: readonly FishTier[] = ["common", "uncommon", "rare", "epic", "mythic"];

/** Vietnamese tier names (player-facing UI). */
export const TIER_LABELS: Record<FishTier, string> = {
  common: "Thường",
  uncommon: "Ít gặp",
  rare: "Hiếm",
  epic: "Sử thi",
  mythic: "Huyền thoại",
};

export interface FishDef {
  id: string;
  name: string;
  tier: FishTier;
  /** Sold straight into the catcher's own wallet when landed. */
  price: number;
  /** Seconds of continuous holding to land it with a level-1 rod (higher rods reel faster). */
  hold: number;
  /** Swim speed across the water (px/s); rarer fish are faster. */
  speed: number;
  /** Relative chance of being picked when a new fish spawns. */
  weight: number;
}

/** Every species, common → mythic. Ids are saved / synced; keep existing ones when editing. */
export const FISH: readonly FishDef[] = [
  { id: "ca_ro", name: "Cá rô", tier: "common", price: 8, hold: 2, speed: 40, weight: 40 },
  { id: "ca_chep", name: "Cá chép", tier: "common", price: 14, hold: 2.5, speed: 46, weight: 30 },
  { id: "ca_thu", name: "Cá thu", tier: "common", price: 18, hold: 2.5, speed: 50, weight: 30 },
  { id: "ca_tre", name: "Cá trê", tier: "uncommon", price: 25, hold: 3, speed: 55, weight: 12 },
  { id: "ca_bon", name: "Cá bơn", tier: "uncommon", price: 32, hold: 3, speed: 58, weight: 8 },
  { id: "ca_he", name: "Cá hè", tier: "uncommon", price: 40, hold: 3.5, speed: 62, weight: 8 },
  { id: "luon", name: "Lươn", tier: "uncommon", price: 48, hold: 3.5, speed: 66, weight: 8 },
  { id: "ca_tram", name: "Cá trầm", tier: "rare", price: 80, hold: 5, speed: 72, weight: 4 },
  { id: "ca_loc", name: "Cá lóc vàng", tier: "rare", price: 130, hold: 5.5, speed: 80, weight: 3 },
  { id: "ca_nuc", name: "Cá nóc", tier: "rare", price: 150, hold: 5.5, speed: 84, weight: 3 },
  { id: "ca_koi", name: "Cá koi", tier: "epic", price: 300, hold: 7, speed: 92, weight: 2 },
  { id: "ca_duoi", name: "Cá đuối", tier: "epic", price: 380, hold: 7.5, speed: 98, weight: 2 },
  { id: "ca_mat_trang", name: "Cá mặt trăng", tier: "epic", price: 450, hold: 8, speed: 104, weight: 2 },
  { id: "ca_rong", name: "Cá rồng", tier: "mythic", price: 900, hold: 9, speed: 110, weight: 1 },
  { id: "ca_map", name: "Cá mập", tier: "mythic", price: 1200, hold: 10, speed: 118, weight: 1 },
];

export const getFish = (id: string): FishDef | undefined => FISH.find((f) => f.id === id);

// Caught-species log ("sổ cá"): species id -> times landed, kept per username in SharedShop and
// mirrored to clients as a compact string (see Player.caughtLog).

/** Serialise a caught-species record as "id:count,id:count" (FISH order; only integer counts >= 1). */
export function encodeCaught(rec: Record<string, number>): string {
  return FISH.filter((f) => Number.isInteger(rec[f.id]) && rec[f.id] >= 1)
    .map((f) => `${f.id}:${rec[f.id]}`)
    .join(",");
}

/** Parse a caught-species string; unknown ids and counts that are not integers >= 1 are dropped. */
export function parseCaught(s: string): Record<string, number> {
  const rec: Record<string, number> = {};
  if (typeof s !== "string" || !s) return rec;
  for (const part of s.split(",")) {
    const [id, count] = part.split(":");
    const n = Number(count);
    if (getFish(id) && Number.isInteger(n) && n >= 1) rec[id] = n;
  }
  return rec;
}

export interface RodDef {
  /** 1..5. */
  level: number;
  name: string;
  /** Upgrade price (level 1 is the free starting rod). */
  price: number;
  /** Reeling speed multiplier: reelProgress += dt * reel / fish.hold while holding. */
  reel: number;
  /** P(a fish of FISH_TIERS[i] takes the hook when the hook touches it). */
  bite: readonly number[];
  /** Line colour drawn while this rod is out (hex RGB number); distinct per level, readable on water. */
  lineColor: number;
}

export const RODS: readonly RodDef[] = [
  { level: 1, name: "Cần tre", price: 0, reel: 1.0, bite: [1, 0.9, 0.5, 0.25, 0.05], lineColor: 0x3d2c29 },
  { level: 2, name: "Cần gỗ", price: 300, reel: 1.2, bite: [1, 1, 0.65, 0.4, 0.12], lineColor: 0x2e9e44 },
  { level: 3, name: "Cần carbon", price: 900, reel: 1.5, bite: [1, 1, 0.8, 0.6, 0.25], lineColor: 0x1e88e5 },
  { level: 4, name: "Cần hợp kim", price: 2200, reel: 1.9, bite: [1, 1, 0.95, 0.8, 0.5], lineColor: 0x8e44ad },
  { level: 5, name: "Cần vàng", price: 5000, reel: 2.4, bite: [1, 1, 1, 1, 0.85], lineColor: 0xf5b301 },
];

export const getRod = (level: number): RodDef | undefined => RODS.find((r) => r.level === level);

/** Line colour for `rodLevel` (unknown levels fall back to the level-1 colour). */
export const rodLineColor = (level: number) => getRod(level)?.lineColor ?? RODS[0].lineColor;

/** P(a fish of `tier` takes a hook cast with `rodLevel`). */
export function biteChance(rodLevel: number, tier: FishTier): number {
  const rod = getRod(rodLevel);
  const index = FISH_TIERS.indexOf(tier);
  return rod && index >= 0 ? rod.bite[index] : 0;
}

/** Reel progress gained per second while holding, with `rodLevel` against `fish`. */
export const reelRate = (rodLevel: number, fish: FishDef) => (getRod(rodLevel)?.reel ?? 1) / fish.hold;

/** One fishing session, in seconds (the server env FISH_SECONDS overrides it for tests). */
export const FISH_SECONDS = 600;
/** Fish always swimming in the pond; a caught one is replaced right away. */
export const FISH_COUNT = 10;
/** The hook falls straight down at this speed (px/s). */
export const HOOK_SPEED = 160;
/** A fish this close to the hook may take it. */
export const HOOK_RADIUS = 18;
/** reelProgress starts here once a fish bites. */
export const REEL_START = 0.3;
/** reelProgress lost per second while the player isn't holding. */
export const REEL_DECAY = 0.15;
/** A bite not landed within this many seconds escapes. */
export const REEL_TIMEOUT = 25;

/** Pick a species for a new fish, weighted (common 40/30/30, uncommon 12/8/8/8, rare 4/3/3, epic 2/2/2, mythic 1/1). */
export function pickFishSpecies(rng: () => number = Math.random): FishDef {
  const total = FISH.reduce((sum, f) => sum + f.weight, 0);
  let roll = rng() * total;
  for (const f of FISH) {
    roll -= f.weight;
    if (roll <= 0) return f;
  }
  return FISH[0];
}
