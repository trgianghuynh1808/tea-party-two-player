import { expect, test } from "@playwright/test";
import { joinAsHost } from "./helpers";
import { TEST_CLIENT_URL, TEST_SERVER_URL } from "./ports";

/**
 * Test port isolation (task .agents/tasks/2026-11-25-task-08-cho-playwright-dung-cong-rieng-vi-du-256.md):
 * - T1: a page started by Playwright lives on the test client port (5174) and is connected to the
 *   test server (2568): /health answers there and /rooms lists the room the page created.
 */

/** Unique per test run; shops persist per username in server/data/. */
let userSeq = 0;
const uniqueUser = () => `p1-${Date.now().toString(36)}-${userSeq++}`;

type RoomsResponse = { rooms: { id: string }[] };

test("T1: the game runs on the dedicated test ports and talks to the test server", async ({ page }) => {
  await joinAsHost(page, uniqueUser());

  // The client is served by the test Vite dev server, not the developer's 5173.
  expect(page.url().startsWith(TEST_CLIENT_URL)).toBe(true);

  // The test server is up on 2568.
  const health = await page.request.get(`${TEST_SERVER_URL}/health`);
  expect(health.status()).toBe(200);

  // The room the page joined is known to the server on 2568 -> the client uses the test server.
  const roomId = await page.evaluate(() => window.__GAME__?.room.roomId);
  expect(roomId).toBeTruthy();
  const rooms = (await (await page.request.get(`${TEST_SERVER_URL}/rooms`)).json()) as RoomsResponse;
  expect(rooms.rooms.some((room) => room.id === roomId)).toBe(true);
});
