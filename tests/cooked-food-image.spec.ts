import { existsSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { FOODS, foodImage } from "@boba/shared";

test("T1: boiled rice and noodles swap in their cooked artwork; other foods keep the raw image", () => {
  expect(foodImage("rice", ["boil"])).not.toBe(FOODS.rice.image);
  expect(foodImage("noodles", ["boil"])).not.toBe(FOODS.noodles.image);
  expect(foodImage("rice", [])).toBe(FOODS.rice.image);
  expect(foodImage("noodles", ["chop"])).toBe(FOODS.noodles.image);
  expect(foodImage("beef", ["fry"])).toBe(FOODS.beef.image);
});

test("T2: every cooked artwork path in FOODS points to an existing file under client/public/", () => {
  for (const [id, def] of Object.entries(FOODS)) {
    for (const image of Object.values(def.cooked ?? {})) {
      expect(existsSync(`client/public/${image}`), `${id} cooked artwork ${image}`).toBe(true);
    }
  }
});
