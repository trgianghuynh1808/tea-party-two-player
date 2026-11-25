import { expect, test, type Page } from "@playwright/test";

const UPDATE_HOOK = "window.__UPDATE__";

/** Wait for the update checker hook that `?test=1` installs at startup. */
async function waitForUpdateHook(page: Page): Promise<void> {
  await page.waitForFunction(() => !!(window as { __UPDATE__?: unknown }).__UPDATE__);
}

async function checkForUpdate(page: Page): Promise<void> {
  await page.evaluate(() => (window as { __UPDATE__?: { check(): Promise<void> } }).__UPDATE__!.check());
}

test("T1: newest build does not show the update popup", async ({ page }) => {
  await page.goto("/?test=1");
  await waitForUpdateHook(page);
  await expect(page.locator("#update-modal")).toHaveCount(0);

  await checkForUpdate(page);
  await expect(page.locator("#update-modal")).toHaveCount(0);
});

test("T2: a newer build shows the update popup with a reload button", async ({ page }) => {
  await page.goto("/?test=1");
  await waitForUpdateHook(page);

  await page.route("**/version.json*", (route) => route.fulfill({ json: { id: "new-build" } }));
  await checkForUpdate(page);

  const modal = page.locator("#update-modal");
  await expect(modal).toBeVisible();
  await expect(modal).toContainText("Có phiên bản mới");
  await expect(page.locator("#update-reload-btn")).toBeVisible();
  await expect(modal.locator("button")).toHaveCount(1);
});

test("T3: the popup cannot be dismissed; only reload clears it", async ({ page }) => {
  await page.goto("/?test=1");
  await waitForUpdateHook(page);

  await page.route("**/version.json*", (route) => route.fulfill({ json: { id: "new-build" } }));
  await checkForUpdate(page);

  const modal = page.locator("#update-modal");
  await expect(modal).toBeVisible();
  await page.evaluate(() => ((window as { __marker?: number }).__marker = 1));

  await page.keyboard.press("Escape");
  await expect(modal).toBeVisible();

  await modal.click({ position: { x: 5, y: 5 } });
  await expect(modal).toBeVisible();

  await page.unroute("**/version.json*");
  await Promise.all([page.waitForEvent("load"), page.locator("#update-reload-btn").click()]);

  await expect.poll(() => page.evaluate(() => (window as { __marker?: number }).__marker)).toBeUndefined();
  await expect(page.locator("#update-modal")).toHaveCount(0);
});
