import { existsSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { DECORATION_CATALOG, getDecorationDef } from "@boba/shared";

test("T1: bed_pink is gone from the catalog, its art file is deleted, and other beds remain", () => {
  expect(getDecorationDef("bed_pink")).toBeUndefined();
  expect(DECORATION_CATALOG.some((d) => d.kind === "bed_pink")).toBe(false);
  expect(existsSync("client/public/assets/decor/bedroom/bed_pink.png")).toBe(false);
  expect(getDecorationDef("bed_red")).toBeDefined();
});
