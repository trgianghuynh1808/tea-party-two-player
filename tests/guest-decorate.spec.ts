import { rm } from "node:fs/promises";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { DECOR_GRID, DECORATION_CATALOG, DECOR_ROOMS, SHOP_ENTRY_SPAWN, canPlaceDecoration, getDecorationDef } from "@boba/shared";
import { joinAsHost, shopFile, userFile } from "./helpers";
import { TEST_SERVER_URL } from "./ports";

/**
 * Guest decorating (task .agents/tasks/2026-11-28-task-40-toi-muon-chuc-nang-trang-tri-cung-se-gio.md):
 * - T1: a guest can open decorate mode and buy a piece with their own wallet; the host's wallet is untouched.
 * - T2: a guest can't move or sell a placed piece, while the host still can.
 */

const SERVER = TEST_SERVER_URL;
const ADMIN_TOKEN = "test-admin-token";
const AUTH = { Authorization: `Bearer ${ADMIN_TOKEN}` };

/** Unique per test run; shops persist per username in server/data/. */
let userSeq = 0;
const uniqueUser = () => `p1-${Date.now().toString(36)}-${userSeq++}`;

type PlacedState = { id: string; kind: string; x: number; y: number; rotation: number };

/** The part of `window.__GAME__` these tests use (full shape: client/src/testHook.ts). */
type GameHook = {
  room: { roomId: string; sessionId: string };
  send(type: string, payload?: unknown): void;
  state: {
    players: Map<string, { money: number; host: boolean }>;
    decorations: Iterable<PlacedState>;
  };
};

const playersSize = (page: Page) =>
  page.evaluate(() => (window as { __GAME__?: GameHook }).__GAME__?.state.players.size ?? 0);
const moneyOf = (page: Page) =>
  page.evaluate(() => {
    const g = (window as { __GAME__?: GameHook }).__GAME__;
    return g?.state.players.get(g.room.sessionId)?.money ?? -1;
  });
const decorationsOf = (page: Page) =>
  page.evaluate(() => {
    const g = (window as { __GAME__?: GameHook }).__GAME__;
    return g ? Array.from(g.state.decorations, (d) => ({ id: d.id, kind: d.kind, x: d.x, y: d.y, rotation: d.rotation })) : [];
  });
const send = (page: Page, type: string, payload?: unknown) =>
  page.evaluate(([t, p]) => (window as { __GAME__?: GameHook }).__GAME__?.send(t, p), [type, payload] as const);

/** Give a user money through the admin API (mirrors live into an open room). */
async function setMoney(request: APIRequestContext, name: string, money: number): Promise<void> {
  const patch = await request.patch(`${SERVER}/admin/users/${encodeURIComponent(name)}/money`, {
    headers: AUTH,
    data: { set: money },
  });
  expect(patch.status()).toBe(200);
}

/** The cheapest catalog piece: what a guest buys in T1 (and the host's piece in T2). */
function cheapestKind(): string {
  const def = [...DECORATION_CATALOG].sort((a, b) => a.price - b.price)[0];
  expect(def).toBeDefined();
  return def!.kind;
}

/** A free spot for `kind` in the tea shop (wall pieces search the wall strip, floor pieces the floor). */
function decorSpot(
  kind: string,
  others: PlacedState[],
  rotation = 0,
  ignoreId?: string,
  avoid?: { x: number; y: number },
): { x: number; y: number } {
  const def = getDecorationDef(kind);
  expect(def, kind).toBeDefined();
  const room = DECOR_ROOMS[0];
  const area = def!.layer === "wall" ? room.wall : room.floor;
  // The server snaps positions to DECOR_GRID, so only offer grid-aligned spots (the wall box starts at y=4).
  const startX = Math.ceil(area.minX / DECOR_GRID) * DECOR_GRID;
  const startY = Math.ceil(area.minY / DECOR_GRID) * DECOR_GRID;
  for (let y = startY; y <= area.maxY; y += DECOR_GRID)
    for (let x = startX; x <= area.maxX; x += DECOR_GRID) {
      if (avoid && x === avoid.x && y === avoid.y) continue;
      if (canPlaceDecoration(kind, x, y, others, ignoreId, rotation)) return { x, y };
    }
  throw new Error(`no free spot for ${kind}`);
}

/** A guest joins the host's room through its id (the e2e server has DEBUG_WARP=1). */
async function joinAsGuest(page: Page, roomId: string, username: string): Promise<void> {
  await page.goto(`/?test=1&room=${encodeURIComponent(roomId)}`);
  await page.locator("#username-input").fill(username);
  await page.locator("#name-form button[type=submit]").click();
  await page.waitForFunction(() => !!(window as { __GAME__?: unknown }).__GAME__);
}

test("T1: a guest opens decorate mode and buys a piece with their own wallet, the host's wallet stays put", async ({
  browser,
  request,
}) => {
  const hostName = uniqueUser();
  const guestName = uniqueUser();
  const hostCtx = await browser.newContext();
  const guestCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();
  try {
    await joinAsHost(host, hostName);
    await setMoney(request, hostName, 500);
    const roomId = await host.evaluate(() => (window as { __GAME__?: { room: { roomId: string } } }).__GAME__!.room.roomId);
    expect(roomId).toBeTruthy();

    await joinAsGuest(guest, roomId, guestName);
    await expect.poll(() => playersSize(host)).toBe(2);
    await expect.poll(() => playersSize(guest)).toBe(2);
    // The guest's shop exists once they are in the room, so this patch mirrors into their live wallet.
    await setMoney(request, guestName, 500);
    await expect.poll(() => moneyOf(guest)).toBe(500);

    // Players spawn in the yard; the guest goes inside the tea shop, where decorating is open.
    await send(guest, "debug_warp", SHOP_ENTRY_SPAWN);
    await expect(guest.locator("#decorate-btn")).toBeEnabled();

    const kind = cheapestKind();
    const price = getDecorationDef(kind)!.price;
    const spot = decorSpot(kind, []);
    await send(guest, "buy_decoration", { kind, x: spot.x, y: spot.y });

    await expect.poll(async () => (await decorationsOf(host)).length).toBe(1);
    await expect.poll(async () => (await decorationsOf(guest)).length).toBe(1);
    expect((await decorationsOf(host))[0]).toMatchObject({ kind, x: spot.x, y: spot.y });
    await expect.poll(() => moneyOf(guest)).toBe(500 - price);
    expect(await moneyOf(host)).toBe(500);
  } finally {
    await hostCtx.close();
    await guestCtx.close();
    await rm(shopFile(hostName), { force: true });
    await rm(userFile(hostName), { force: true });
    await rm(shopFile(guestName), { force: true });
    await rm(userFile(guestName), { force: true });
  }
});

test("T2: a guest's move/sell of a placed piece is refused, while the host can still move it", async ({ browser, request }) => {
  const hostName = uniqueUser();
  const guestName = uniqueUser();
  const hostCtx = await browser.newContext();
  const guestCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();
  try {
    // Host buys one piece before the guest joins, so the guest sees a piece placed by someone else.
    await joinAsHost(host, hostName);
    await setMoney(request, hostName, 500);
    const roomId = await host.evaluate(() => (window as { __GAME__?: { room: { roomId: string } } }).__GAME__!.room.roomId);
    expect(roomId).toBeTruthy();
    const kind = cheapestKind();
    const price = getDecorationDef(kind)!.price;
    const spot = decorSpot(kind, []);
    await send(host, "buy_decoration", { kind, x: spot.x, y: spot.y });
    await expect.poll(async () => (await decorationsOf(host)).length).toBe(1);
    const [piece] = await decorationsOf(host);
    expect(piece).toMatchObject({ kind, x: spot.x, y: spot.y });
    const hostMoneyAfterBuy = 500 - price;
    await expect.poll(() => moneyOf(host)).toBe(hostMoneyAfterBuy);

    await joinAsGuest(guest, roomId, guestName);
    await expect.poll(() => playersSize(guest)).toBe(2);
    await setMoney(request, guestName, 500);
    await expect.poll(() => moneyOf(guest)).toBe(500);

    // The guest tries to move the piece, then to sell it: both are host-only.
    const moved = decorSpot(kind, [piece], 0, piece.id, { x: piece.x, y: piece.y });
    expect(moved).not.toEqual({ x: piece.x, y: piece.y });
    await send(guest, "move_decoration", { id: piece.id, x: moved.x, y: moved.y });
    await send(guest, "sell_decoration", { id: piece.id });
    await host.waitForTimeout(800);

    const afterRefused = await decorationsOf(host);
    expect(afterRefused).toHaveLength(1);
    expect(afterRefused[0]).toMatchObject({ id: piece.id, x: piece.x, y: piece.y });
    expect((await decorationsOf(guest))[0]).toMatchObject({ id: piece.id, x: piece.x, y: piece.y });
    expect(await moneyOf(host)).toBe(hostMoneyAfterBuy);

    // The host moves it: the position changes on both clients.
    await send(host, "move_decoration", { id: piece.id, x: moved.x, y: moved.y });
    await expect.poll(async () => (await decorationsOf(host)).find((d) => d.id === piece.id)).toMatchObject({
      x: moved.x,
      y: moved.y,
    });
    await expect.poll(async () => (await decorationsOf(guest)).find((d) => d.id === piece.id)).toMatchObject({
      x: moved.x,
      y: moved.y,
    });
  } finally {
    await hostCtx.close();
    await guestCtx.close();
    await rm(shopFile(hostName), { force: true });
    await rm(userFile(hostName), { force: true });
    await rm(shopFile(guestName), { force: true });
    await rm(userFile(guestName), { force: true });
  }
});
