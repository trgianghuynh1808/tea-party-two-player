import { expect, test } from "@playwright/test";
import { joinAsHost, startRestaurantShift } from "./helpers";

test("T1: no /assets request fails during a restaurant shift", async ({ page }) => {
  const username = `junk-${Date.now()}`;
  const failed: string[] = [];

  page.on("response", (response) => {
    if (response.url().includes("/assets/") && response.status() >= 400) {
      failed.push(`${response.status()} ${response.url()}`);
    }
  });
  page.on("requestfailed", (request) => {
    if (request.url().includes("/assets/")) {
      failed.push(`FAILED ${request.url()} ${request.failure()?.errorText ?? ""}`);
    }
  });

  await joinAsHost(page, username);
  await page.waitForTimeout(2000);
  await startRestaurantShift(page);
  await page.waitForTimeout(1000);

  expect(failed).toEqual([]);
});
