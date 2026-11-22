import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { SERVER_PORT, getDecorationDef } from "@boba/shared";
import { joinAsHost } from "./helpers";

/**
 * Admin portal e2e (task .agents/tasks/2026-11-22-admin-portal.md):
 * - T1 drives the admin API directly (the request fixture, "Authorization: Bearer" header).
 * - T2 drives the /portal page the server itself serves (page fixture + the game hook to buy furniture).
 * - T4/T5 cover deleting a user (task .agents/tasks/2026-11-22-admin-delete-user.md): the API rules
 *   (token, confirm, 404/409, the storage endpoint removed) and the portal row's Xoá button.
 * playwright.config.ts starts the server with ADMIN_TOKEN set, so these tests need a server
 * started by Playwright: a dev server without the token would answer 404 instead of 401.
 */
const SERVER = `http://localhost:${SERVER_PORT}`;
const ADMIN_TOKEN = "test-admin-token";
const AUTH = { Authorization: `Bearer ${ADMIN_TOKEN}` };

/** Unique per test run; shops persist per username in server/data/.
 *  Base36 keeps the name within USERNAME_MAX (16): longer names get truncated by the join form,
 *  and the admin API (no form) would then not find the user the room actually created. */
let userSeq = 0;
const uniqueUser = () => `p1-${Date.now().toString(36)}-${userSeq++}`;

/** The part of `window.__GAME__` these tests use (full shape: client/src/testHook.ts). */
type GameHook = { send(type: string, payload?: unknown): void };

/** Buy furniture through the in-page test hook (the host, outside a shift). */
async function buyDecoration(page: Page, piece: { kind: string; x: number; y: number }): Promise<void> {
  // Evaluate callbacks cannot close over Node-scope values, so the cast is inlined.
  await page.evaluate((p) => (window as { __GAME__?: GameHook }).__GAME__?.send("buy_decoration", p), piece);
}

/** That user's pieces with venue info, via the admin API. */
async function decorationsOf(request: APIRequestContext, name: string) {
  const res = await request.get(`${SERVER}/admin/users/${encodeURIComponent(name)}/decorations`, { headers: AUTH });
  expect(res.status()).toBe(200);
  return (await res.json()) as { money: number; pieces: { venue: string }[] };
}

/** Buys are async game messages: poll the admin API until the user owns `count` pieces. */
async function waitForPieceCount(request: APIRequestContext, name: string, count: number): Promise<void> {
  await expect.poll(async () => (await decorationsOf(request, name)).pieces.length).toBe(count);
}

/** A "plant" in the open middle of the restaurant (x >= 1400, clear of the kitchen columns and rows). */
const RESTAURANT_PLANT = { kind: "plant", x: 1800, y: 400 };
/** A "plant" in the open middle of the tea shop (x <= 960, clear of the machines and counters). */
const SHOP_PLANT = { kind: "plant", x: 500, y: 450 };
const PLANT_PRICE = getDecorationDef("plant")!.price;

test("T1: admin API — no token is 401, pieces come back per venue, deleting a venue refunds the full price, reset rejects the shop venue", async ({ page, request }) => {
  // No token: the admin middleware answers 401 before any route runs.
  expect((await request.get(`${SERVER}/admin/users`)).status()).toBe(401);
  expect((await request.patch(`${SERVER}/admin/users/x/money`, { data: { set: 1 } })).status()).toBe(401);
  expect((await request.delete(`${SERVER}/admin/users/x/decorations`, { data: { venue: "shop" } })).status()).toBe(401);

  // A fresh player has $0: create them by opening a room, then top the wallet up through the API.
  const user = uniqueUser();
  await joinAsHost(page, user);
  const patch = await request.patch(`${SERVER}/admin/users/${encodeURIComponent(user)}/money`, {
    headers: AUTH,
    data: { set: 1000 },
  });
  expect(patch.status()).toBe(200);
  expect(await patch.json()).toMatchObject({ ok: true, money: 1000 });

  // Buy one piece in each venue.
  await buyDecoration(page, RESTAURANT_PLANT);
  await buyDecoration(page, SHOP_PLANT);
  await waitForPieceCount(request, user, 2);
  const before = await decorationsOf(request, user);
  expect(before.money).toBe(1000 - 2 * PLANT_PRICE);
  expect(before.pieces.filter((p) => p.venue === "restaurant")).toHaveLength(1);
  expect(before.pieces.filter((p) => p.venue === "shop")).toHaveLength(1);

  // Delete the restaurant pieces (default refund: the FULL price). The tea-shop piece stays.
  const del = await request.delete(`${SERVER}/admin/users/${encodeURIComponent(user)}/decorations`, {
    headers: AUTH,
    data: { venue: "restaurant" },
  });
  expect(del.status()).toBe(200);
  expect(await del.json()).toMatchObject({ ok: true, removed: 1, refunded: PLANT_PRICE, money: before.money + PLANT_PRICE });

  const after = await decorationsOf(request, user);
  expect(after.pieces).toHaveLength(1);
  expect(after.pieces[0].venue).toBe("shop");

  // The bulk reset only ever accepts the restaurant venue.
  const reset = await request.post(`${SERVER}/admin/decorations/reset`, { headers: AUTH, data: { venue: "shop" } });
  expect(reset.status()).toBe(400);
});

test("T2: portal page — a wrong token shows the error, the user row lists their restaurant pieces, deleting them from the detail view refunds", async ({ page, request }) => {
  // Set the user up through the API + the game hook: $1000 and one piece in the restaurant.
  const user = uniqueUser();
  await joinAsHost(page, user);
  const patch = await request.patch(`${SERVER}/admin/users/${encodeURIComponent(user)}/money`, {
    headers: AUTH,
    data: { set: 1000 },
  });
  expect(patch.status()).toBe(200);
  await buyDecoration(page, RESTAURANT_PLANT);
  await waitForPieceCount(request, user, 1);

  await page.goto(`${SERVER}/portal`);

  // Wrong token: the portal reports it and stays on the login screen.
  await page.fill("#tokenInput", "wrong-token");
  await page.click("#loginBtn");
  await expect(page.locator("#msg")).toContainText("Sai token");

  // Right token: the user appears with 1 restaurant piece (column 4: name / money / shop pieces / restaurant pieces).
  await page.fill("#tokenInput", ADMIN_TOKEN);
  await page.click("#loginBtn");
  const row = page.locator("#usersBody tr", { hasText: user });
  await expect(row).toHaveCount(1);
  await expect(row.locator("td").nth(3)).toHaveText("1");

  // Detail view: deleting the user's restaurant pieces refunds the full price into the wallet.
  await row.click();
  await expect(page.locator("#detailMoney")).toHaveText(`$${1000 - PLANT_PRICE}`);
  await expect(page.locator("#restaurantCount")).toHaveText("(1 món)");

  await page.click("#removeRestaurantBtn");
  await expect(page.locator("#restaurantCount")).toHaveText("(0 món)");
  await expect(page.locator("#detailMoney")).toHaveText("$1000");
});

test("T4: delete user API — no token is 401, missing confirm is 400, with confirm the user is gone, /admin/storage is 404, a user in a room is 409", async ({ page, request }) => {
  // Create a user who never played, with money, through the shop-restore API.
  const user = uniqueUser();
  const put = await request.put(`${SERVER}/admin/users/${encodeURIComponent(user)}/shop`, {
    headers: AUTH,
    data: { money: 500, decorations: [] },
  });
  expect(put.status()).toBe(200);

  // No token: the admin middleware answers 401 before the route runs.
  expect((await request.delete(`${SERVER}/admin/users/${encodeURIComponent(user)}`)).status()).toBe(401);

  // A DELETE without confirm: true must not delete anything.
  const noConfirm = await request.delete(`${SERVER}/admin/users/${encodeURIComponent(user)}`, {
    headers: AUTH,
    data: {},
  });
  expect(noConfirm.status()).toBe(400);

  // The removed storage-diagnostics endpoint is gone (404 with a valid token).
  expect((await request.get(`${SERVER}/admin/storage`, { headers: AUTH })).status()).toBe(404);

  // With confirm: true the user is deleted: the response is 200...
  const del = await request.delete(`${SERVER}/admin/users/${encodeURIComponent(user)}`, {
    headers: AUTH,
    data: { confirm: true },
  });
  expect(del.status()).toBe(200);
  // ...their record is gone...
  expect((await request.get(`${SERVER}/admin/users/${encodeURIComponent(user)}`, { headers: AUTH })).status()).toBe(404);
  // ...and the user listing no longer has them.
  const list = (await (await request.get(`${SERVER}/admin/users`, { headers: AUTH })).json()) as { name: string }[];
  expect(list.some((u) => u.name === user)).toBe(false);

  // A user who is in a room (their game page is still open) cannot be deleted: 409, still there.
  const playing = uniqueUser();
  await joinAsHost(page, playing);
  const busy = await request.delete(`${SERVER}/admin/users/${encodeURIComponent(playing)}`, {
    headers: AUTH,
    data: { confirm: true },
  });
  expect(busy.status()).toBe(409);
  expect((await request.get(`${SERVER}/admin/users/${encodeURIComponent(playing)}`, { headers: AUTH })).status()).toBe(200);
});

test("T5: portal delete — the row's Xoá button (confirm dialog) removes the user, stays on the list, and the diag box is gone", async ({ page, request }) => {
  // A user with money, created through the API.
  const user = uniqueUser();
  const put = await request.put(`${SERVER}/admin/users/${encodeURIComponent(user)}/shop`, {
    headers: AUTH,
    data: { money: 300, decorations: [] },
  });
  expect(put.status()).toBe(200);

  await page.goto(`${SERVER}/portal`);
  await page.fill("#tokenInput", ADMIN_TOKEN);
  await page.click("#loginBtn");
  const row = page.locator("#usersBody tr", { hasText: user });
  await expect(row).toHaveCount(1);

  // The delete button asks for confirmation: accept it.
  page.once("dialog", (dialog) => void dialog.accept());
  await row.locator("button.danger").click();

  // The row disappears, the list view stays open (no detail view), and the diag box is gone.
  await expect(row).toHaveCount(0);
  await expect(page.locator("#detailView")).toBeHidden();
  await expect(page.locator("#diagBox")).toHaveCount(0);
});
