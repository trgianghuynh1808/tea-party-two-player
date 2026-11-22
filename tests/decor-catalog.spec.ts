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
];

test("T2: the 8 removed items are gone from the catalog and disk, kept neighbours remain", () => {
  for (const { kind, image } of REMOVED_ITEMS) {
    expect(getDecorationDef(kind)).toBeUndefined();
    expect(existsSync(`client/public/assets/decor/${image}`)).toBe(false);
  }
  expect(getDecorationDef("lamp")).toBeDefined();
  expect(getDecorationDef("lantern_brass")).toBeDefined();
  expect(existsSync("client/public/assets/decor/red_lantern_lit.png")).toBe(true);
});
