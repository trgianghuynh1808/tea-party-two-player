import { existsSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { DECORATION_CATALOG, getDecorationDef } from "@boba/shared";

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
