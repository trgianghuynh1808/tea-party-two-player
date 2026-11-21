import type { Page } from "@playwright/test";

/** The part of `window.__GAME__` these helpers use (full shape: client/src/testHook.ts). */
type GameHook = { send(type: string, payload?: unknown): void };

/** Open the client in e2e test mode and create a room as its only (host) player. */
export async function joinAsHost(page: Page, username: string): Promise<void> {
  await page.goto("/?test=1");
  await page.locator("#username-input").fill(username);
  await page.locator("#name-form button[type=submit]").click();
  await page.locator("#create-btn").click();
  // Evaluate callbacks cannot close over Node-scope values, so the cast is inlined in each.
  await page.waitForFunction(() => !!(window as { __GAME__?: unknown }).__GAME__);
}

/**
 * Start a restaurant shift through the test hook (the server accepts it from any client,
 * the first order arrives ~2s later), then wait until the orders panel renders one.
 */
export async function startRestaurantShift(page: Page): Promise<void> {
  await page.evaluate(() => (window as { __GAME__?: GameHook }).__GAME__?.send("start_shift", { venue: "restaurant" }));
  await page.locator("#orders-panel .order .part-into").first().waitFor({ timeout: 20_000 });
}
