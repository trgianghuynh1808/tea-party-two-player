import { expect, test } from "@playwright/test";

test("T1: the browser tab title is \"Tea Party\"", async ({ page }) => {
  await page.goto("/?test=1");
  await expect(page).toHaveTitle("Tea Party");
});
