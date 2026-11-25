import { expect, test } from "@playwright/test";

test("T1: the browser tab title is \"Nhà Ngọc và Giang\"", async ({ page }) => {
  await page.goto("/?test=1");
  await expect(page).toHaveTitle("Nhà Ngọc và Giang");
});
