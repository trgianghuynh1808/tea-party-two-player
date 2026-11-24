import { existsSync, readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import {
  DECORATION_CATALOG,
  canPlaceDecoration,
  footprintOf,
  getDecorationDef,
  normalizeRotation,
  rotationCount,
} from "@boba/shared";
import { joinAsHost } from "./helpers";

test("T1: bed_pink is gone from the catalog, its art file is deleted, and other beds remain", () => {
  expect(getDecorationDef("bed_pink")).toBeUndefined();
  expect(DECORATION_CATALOG.some((d) => d.kind === "bed_pink")).toBe(false);
  expect(existsSync("client/public/assets/decor/bedroom/bed_pink.png")).toBe(false);
  expect(getDecorationDef("bed_red")).toBeDefined();
});

const REMOVED_ITEMS: { kind: string; image: string }[] = [
  { kind: "bucket", image: "bedroom/bucket.png" },
  { kind: "chair_wood_back", image: "bedroom/chair_back.png" },
  { kind: "chair_wood_side", image: "bedroom/chair_side.png" },
  { kind: "desk_set", image: "bedroom/desk_set.png" },
  { kind: "fern_small", image: "fern_small.png" },
  { kind: "red_lantern", image: "red_lantern.png" },
  { kind: "rug_blue", image: "rug_blue.png" },
  { kind: "rug_oval_blue", image: "rug_oval_blue.png" },
  { kind: "chair_cream", image: "furniture/chair_cream.png" },
  { kind: "coat_stand", image: "furniture/coat_stand.png" },
  { kind: "plant_big_leaf", image: "furniture/plant_big_leaf.png" },
  { kind: "plant_leafy", image: "furniture/plant_leafy.png" },
  { kind: "vanity_piano", image: "furniture/vanity_piano.png" },
  { kind: "vanity_mirror", image: "furniture/vanity_mirror.png" },
];

test("T2: the 14 removed items are gone from the catalog and disk, kept neighbours remain", () => {
  for (const { kind, image } of REMOVED_ITEMS) {
    expect(getDecorationDef(kind)).toBeUndefined();
    expect(existsSync(`client/public/assets/decor/${image}`)).toBe(false);
  }
  expect(getDecorationDef("lamp")).toBeDefined();
  expect(getDecorationDef("lantern_brass")).toBeDefined();
  expect(existsSync("client/public/assets/decor/red_lantern_lit.png")).toBe(true);
});

const NEW_FURNITURE: { kind: string; seat?: true }[] = [
  { kind: "armchair_baroque", seat: true },
  { kind: "armchair_cream", seat: true },
  { kind: "lamp_arc_brass" },
  { kind: "lamp_shade_white" },
  { kind: "lamp_post_brass" },
  { kind: "lamp_floor_cream" },
  { kind: "globe" },
  { kind: "fireplace_white" },
  { kind: "plant_slim" },
  { kind: "plant_pattern_pot" },
];

test("T3: the 10 remaining furniture pieces are in the catalog with art on disk, the 2 chairs are seats, and no kind is duplicated", () => {
  const kinds = DECORATION_CATALOG.map((d) => d.kind);
  for (const { kind, seat } of NEW_FURNITURE) {
    const def = getDecorationDef(kind);
    expect(def, kind).toBeDefined();
    expect(existsSync(`client/public/${def!.image}`), kind).toBe(true);
    if (seat) expect(def!.role, kind).toBe("seat");
    expect(kinds.filter((k) => k === kind), kind).toHaveLength(1);
  }
});

// ---------------------------------------------------------------- 8 new furniture items with 4 views

const FURNITURE_VIEWS: { kind: string; category: string }[] = [
  { kind: "nightstand_clock", category: "bedroom" },
  { kind: "bookshelf", category: "bedroom" },
  { kind: "bed_plaid", category: "bedroom" },
  { kind: "tv_stand", category: "bedroom" },
  { kind: "wardrobe_open", category: "bedroom" },
  { kind: "desk_pc", category: "bedroom" },
  { kind: "sofa_lilac", category: "seating" },
  { kind: "dining_table", category: "seating" },
];

/** Minimal PNG decode (8-bit RGBA, no interlace) so this spec can check pixels with no extra dependencies. */
function decodePng(file: string): { width: number; height: number; alphaAt: (x: number, y: number) => number } {
  const buf = readFileSync(file);
  expect(buf.subarray(0, 8).toString("hex"), file).toBe("89504e470d0a1a0a");
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  expect(buf[24], `${file} bit depth`).toBe(8);
  expect(buf[25], `${file} colour type`).toBe(6); // truecolour + alpha
  const idat: Buffer[] = [];
  for (let o = 8; o + 8 <= buf.length; ) {
    const length = buf.readUInt32BE(o);
    const type = buf.subarray(o + 4, o + 8).toString("ascii");
    if (type === "IDAT") idat.push(buf.subarray(o + 8, o + 8 + length));
    o += length + 12;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const rgba = Buffer.alloc(height * stride);
  const paeth = (a: number, b: number, c: number) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? rgba[y * stride + x - 4] : 0;
      const b = y > 0 ? rgba[(y - 1) * stride + x] : 0;
      const c = x >= 4 && y > 0 ? rgba[(y - 1) * stride + x - 4] : 0;
      const add = filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1 : filter === 4 ? paeth(a, b, c) : 0;
      rgba[y * stride + x] = (raw[y * (stride + 1) + 1 + x] + add) & 255;
    }
  }
  return { width, height, alphaAt: (x: number, y: number) => rgba[y * stride + x * 4 + 3] };
}

test("furniture-views T1: 8 four-view items in the catalog, 4 view PNGs with alpha each, right category and roles", () => {
  for (const { kind, category } of FURNITURE_VIEWS) {
    const def = getDecorationDef(kind);
    expect(def, kind).toBeDefined();
    expect(def!.rotation, kind).toBe("views");
    expect(rotationCount(def!), kind).toBe(4);
    expect(def!.category, kind).toBe(category);
    expect(Object.keys(def!.views ?? {}), kind).toHaveLength(4);
    for (const view of ["front", "left", "back", "right"] as const) {
      const file = `client/public/${def!.views![view]}`;
      expect(existsSync(file), `${kind}/${view}`).toBe(true);
      const { width, height, alphaAt } = decodePng(file);
      // Cut out of a white sheet: a corner is transparent, the middle third holds solid artwork.
      expect(
        [alphaAt(0, 0), alphaAt(width - 1, 0), alphaAt(0, height - 1), alphaAt(width - 1, height - 1)].some((a) => a === 0),
        `${kind}/${view} transparent corner`,
      ).toBe(true);
      let solid = false;
      for (let y = (height / 3) | 0; !solid && y <= (2 * height) / 3; y++)
        for (let x = (width / 3) | 0; x <= (2 * width) / 3; x++)
          if (alphaAt(x, y) === 255) {
            solid = true;
            break;
          }
      expect(solid, `${kind}/${view} solid middle`).toBe(true);
    }
  }
  expect(getDecorationDef("bed_plaid")!.role).toBe("bed");
  expect(getDecorationDef("dining_table")!.role).toBe("table");
});

test("furniture-views T2: turning bookshelf swaps its footprint, so it fits where the front view can't", () => {
  const def = getDecorationDef("bookshelf")!;
  expect([footprintOf(def, 0), footprintOf(def, 2)]).toStrictEqual([
    { width: 70, height: 22 },
    { width: 70, height: 22 },
  ]);
  expect([footprintOf(def, 1), footprintOf(def, 3)]).toStrictEqual([
    { width: 22, height: 70 },
    { width: 22, height: 70 },
  ]);
  // 12 px from the shop floor's left edge (clear of all stations there): the turned 22x70 footprint fits,
  // the 70x22 front/back view sticks out past the wall.
  expect(canPlaceDecoration("bookshelf", 12, 550, [], undefined, 1)).toBe(true);
  expect(canPlaceDecoration("bookshelf", 12, 550, [], undefined, 3)).toBe(true);
  expect(canPlaceDecoration("bookshelf", 12, 550, [], undefined, 0)).toBe(false);
  expect(canPlaceDecoration("bookshelf", 12, 550, [], undefined, 2)).toBe(false);
});

test("furniture-views T3: bed_plaid has a pillow per view within 0..1, and normalizeRotation clamps to 0..3", () => {
  const def = getDecorationDef("bed_plaid")!;
  expect(def.role).toBe("bed");
  expect(Object.keys(def.pillows ?? {})).toHaveLength(4);
  for (const view of ["front", "left", "back", "right"] as const) {
    const pillow = def.pillows![view];
    expect(pillow, view).toBeDefined();
    expect(pillow.x, `${view} x`).toBeGreaterThanOrEqual(0);
    expect(pillow.x, `${view} x`).toBeLessThanOrEqual(1);
    expect(pillow.y, `${view} y`).toBeGreaterThanOrEqual(0);
    expect(pillow.y, `${view} y`).toBeLessThanOrEqual(1);
  }
  for (const rotation of [0, 1, 2, 3]) expect(normalizeRotation(def, rotation)).toBe(rotation);
  expect(normalizeRotation(def, 4)).toBe(0);
});

// ---------------------------------------------------------------- ⟳ badge on rotatable items

/** Unique per test run; shops persist per username in server/data/. */
let userSeq = 0;
const uniqueUser = () => `p1-${Date.now()}-${userSeq++}`;

test("rotate-badge T1: only items with rotationCount > 1 carry the ⟳ badge in the decor panel", async ({ page }) => {
  await joinAsHost(page, uniqueUser());
  await page.locator("#decorate-btn").click();
  // The panel remembers collapsed groups, so open every section before counting cards.
  await page.evaluate(() =>
    document.querySelectorAll<HTMLDetailsElement>("#decor-panel details.decor-section").forEach((s) => (s.open = true)),
  );
  const domItems = await page.evaluate(() =>
    [...document.querySelectorAll("#decor-panel .decor-item")].map((el) => ({
      label: el.querySelector(".name")?.textContent ?? "",
      badge: el.querySelector(".rotate-badge")?.textContent ?? "",
    })),
  );
  // Expected: one card per catalog item, badged with ⟳ iff the piece can be turned.
  const expected = DECORATION_CATALOG.map((def) => ({
    label: def.label,
    badge: rotationCount(def) > 1 ? "⟳" : "",
  }));
  const key = (item: { label: string; badge: string }) => `${item.label}\u0000${item.badge}`;
  expect(domItems.map(key).sort()).toStrictEqual(expected.map(key).sort());
});
