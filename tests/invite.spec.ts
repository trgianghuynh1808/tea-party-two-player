import { expect, test, type Page } from "@playwright/test";
import { joinAsHost } from "./helpers";

/**
 * Invite flow e2e (task .agents/tasks/2026-11-28-task-39-...):
 * - T1: the host opens the invite panel, sees an online guest, invites them; the guest accepts the
 *   popup and ends up in the same room as the host.
 * - T2: the guest declines and stays in the lobby; the host's room in the lobby list is private,
 *   with no working "Vào" button.
 * The e2e server runs with DEBUG_WARP=1, so onAuth lets anyone in: these specs check the invite UI
 * flow, not the token rejection (see the task's "Test facts").
 */

let userSeq = 0;
/** Unique per test run (shops persist per username) and within USERNAME_MAX (16). */
const uniqueName = (prefix: "host" | "guest") => `${prefix}-${Date.now().toString(36)}-${userSeq++}`;

const roomIdOf = (page: Page) =>
  page.evaluate(() => (window as { __GAME__?: { room: { roomId: string } } }).__GAME__?.room.roomId);

const roomNameOf = (page: Page) =>
  page.evaluate(() => (window as { __GAME__?: { state: { roomName: string } } }).__GAME__?.state.roomName ?? "");

const playersOf = (page: Page) =>
  page.evaluate(() => (window as { __GAME__?: { state: { players: { size: number } } } }).__GAME__?.state.players.size ?? 0);

const hasGame = (page: Page) => page.evaluate(() => !!(window as { __GAME__?: unknown }).__GAME__);

/** Open the client in test mode, enter a name and stay in the lobby (no room created or joined). */
async function stayInLobby(page: Page, name: string): Promise<void> {
  await page.goto("/?test=1");
  await page.locator("#username-input").fill(name);
  await page.locator("#name-form button[type=submit]").click();
  await expect(page.locator("#lobby-main")).toBeVisible();
}

test("T1: host invites an online player and the guest accepts into the same room", async ({ browser }) => {
  const hostName = uniqueName("host");
  const guestName = uniqueName("guest");
  const hostCtx = await browser.newContext();
  const guestCtx = await browser.newContext();
  try {
    const hostPage = await hostCtx.newPage();
    const guestPage = await guestCtx.newPage();
    await joinAsHost(hostPage, hostName);
    await stayInLobby(guestPage, guestName);

    await expect(hostPage.locator("#invite-btn")).toBeEnabled();
    await hostPage.locator("#invite-btn").click();
    await expect(hostPage.locator(".invite-row").filter({ hasText: guestName })).toBeVisible({ timeout: 20_000 });
    await expect(hostPage.locator(".invite-row").filter({ hasText: hostName })).toHaveCount(0);

    const roomName = await roomNameOf(hostPage);
    await hostPage.locator(".invite-row").filter({ hasText: guestName }).locator("button").click();

    const popup = guestPage.locator("#invite-popup");
    await expect(popup).toBeVisible({ timeout: 20_000 });
    await expect(popup).toContainText(hostName);
    await expect(popup).toContainText(roomName);
    await guestPage.locator("#invite-accept").click();

    await guestPage.waitForFunction(() => !!(window as { __GAME__?: unknown }).__GAME__);
    const hostRoomId = await roomIdOf(hostPage);
    const guestRoomId = await roomIdOf(guestPage);
    expect(guestRoomId).toBeTruthy();
    expect(guestRoomId).toBe(hostRoomId);
    await expect.poll(() => playersOf(hostPage)).toBe(2);
  } finally {
    await hostCtx.close();
    await guestCtx.close();
  }
});

test("T2: guest declines and stays in the lobby; other rooms have no working entry button", async ({ browser }) => {
  const hostName = uniqueName("host");
  const guestName = uniqueName("guest");
  const hostCtx = await browser.newContext();
  const guestCtx = await browser.newContext();
  try {
    const hostPage = await hostCtx.newPage();
    const guestPage = await guestCtx.newPage();
    await joinAsHost(hostPage, hostName);
    await stayInLobby(guestPage, guestName);

    // The host's room shows up in the guest's lobby list, but it is private: disabled "Riêng tư".
    const roomName = await roomNameOf(hostPage);
    const roomRow = guestPage.locator(".room-item").filter({ hasText: roomName });
    await expect(roomRow).toBeVisible({ timeout: 20_000 });
    await expect(roomRow.locator("button")).toBeDisabled();
    await expect(roomRow.locator("button")).toHaveText("Riêng tư");

    // Host invites, guest declines.
    await expect(hostPage.locator("#invite-btn")).toBeEnabled();
    await hostPage.locator("#invite-btn").click();
    const guestRow = hostPage.locator(".invite-row").filter({ hasText: guestName });
    await expect(guestRow).toBeVisible({ timeout: 20_000 });
    await guestRow.locator("button").click();

    const popup = guestPage.locator("#invite-popup");
    await expect(popup).toBeVisible({ timeout: 20_000 });
    await guestPage.locator("#invite-decline").click();
    await expect(popup).toBeHidden();
    expect(await hasGame(guestPage)).toBe(false);
    expect(await playersOf(hostPage)).toBe(1);
  } finally {
    await hostCtx.close();
    await guestCtx.close();
  }
});
