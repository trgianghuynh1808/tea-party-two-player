import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import {
  BUILD_TILES,
  YARD_COLS,
  YARD_ROWS,
  buildRotationCount,
  canBuildCell,
  getBuildTile,
  normalizeTileRotation,
  tileKey,
  usernameKey,
} from "@boba/shared";
import { joinAsHost } from "./helpers";
import { TEST_SERVER_URL } from "./ports";

/**
 * Build/decorate parity (task .agents/tasks/2026-11-24-build-parity.md):
 * - T1: facing counts + clamping, and SharedShop restoring tileRotations from a save on disk
 *   (an old save without the field still loads). The save files are written exactly like SharedShop.flush
 *   (ShopStore's JSON backend under server/data/shops), then loaded back by the real server on join.
 * - T2 (two browsers): host move_tile / sell_tile through the room, guests and bad targets refused.
 * - T3: the build panel starts with no tool picked, ⟳ badges + the ⟳ Xoay (R) button, re-click unpicks.
 */

const SERVER = TEST_SERVER_URL;
const ADMIN_TOKEN = "test-admin-token";
const AUTH = { Authorization: `Bearer ${ADMIN_TOKEN}` };

/** Unique per test run; shops persist per username in server/data/. */
let userSeq = 0;
const uniqueUser = () => `p1-${Date.now().toString(36)}-${userSeq++}`;

/** Same id ShopStore derives from a username key (users and new shops are keyed by it). */
const shopIdOf = (name: string) => `u_${createHash("sha256").update(usernameKey(name)).digest("hex").slice(0, 32)}`;
const shopFile = (name: string) => path.join("server/data/shops", `${shopIdOf(name)}.json`);
const userFile = (name: string) => path.join("server/data/users", `${shopIdOf(name)}.json`);

/** The part of `window.__GAME__` these tests use (full shape: client/src/testHook.ts). */
type GameHook = {
  send(type: string, payload?: unknown): void;
  tiles(): Record<string, string>;
  tileRotations(): Record<string, number>;
};

const tilesOf = (page: Page) => page.evaluate(() => (window as { __GAME__?: GameHook }).__GAME__?.tiles() ?? {});
const tileRotationsOf = (page: Page) =>
  page.evaluate(() => (window as { __GAME__?: GameHook }).__GAME__?.tileRotations() ?? {});
const sendTile = (page: Page, type: string, payload: Record<string, number | string>) =>
  page.evaluate(([t, p]) => (window as { __GAME__?: GameHook }).__GAME__?.send(t, p), [type, payload] as const);

/** The first `count` yard cells (row-major from the origin) that allow building (canBuildCell). */
function buildableCells(count: number): { cx: number; cy: number }[] {
  const cells: { cx: number; cy: number }[] = [];
  for (let cy = 0; cy < YARD_ROWS && cells.length < count; cy++)
    for (let cx = 0; cx < YARD_COLS && cells.length < count; cx++) if (canBuildCell(cx, cy)) cells.push({ cx, cy });
  return cells;
}

/** Write a shop save exactly the way SharedShop.flush does (JSON files under server/data/shops). */
async function writeShopSave(name: string, save: Record<string, unknown>): Promise<void> {
  await mkdir(path.join("server/data/shops"), { recursive: true });
  await writeFile(shopFile(name), JSON.stringify(save, null, 2), "utf8");
}

// ---------------------------------------------------------------- T1: facings

test("T1: facing counts/clamping are right, and SharedShop saves + reloads tileRotations (old saves still load)", async ({
  browser,
  page,
}) => {
  // Facing counts: furniture props follow their decorate-catalog def, outdoor props flip, shapes can't turn.
  expect(buildRotationCount(getBuildTile("decor_sofa_lilac")!)).toBe(4); // views furniture
  expect(buildRotationCount(getBuildTile("decor_bed_red")!)).toBe(2); // flip furniture
  expect(buildRotationCount(getBuildTile("decor_plant")!)).toBe(1); // rotation "none"
  expect(buildRotationCount(getBuildTile("pine_s")!)).toBe(2); // outdoor prop
  expect(buildRotationCount(getBuildTile("floor_wood")!)).toBe(1);
  expect(buildRotationCount(getBuildTile("wall_wood")!)).toBe(1);
  expect(buildRotationCount(getBuildTile("door")!)).toBe(1);
  // normalizeTileRotation clamps untrusted input into the supported range.
  expect(normalizeTileRotation(getBuildTile("pine_s")!, 0)).toBe(0);
  expect(normalizeTileRotation(getBuildTile("pine_s")!, 1)).toBe(1);
  expect(normalizeTileRotation(getBuildTile("pine_s")!, 2)).toBe(0);
  expect(normalizeTileRotation(getBuildTile("pine_s")!, -1)).toBe(0);
  expect(normalizeTileRotation(getBuildTile("decor_sofa_lilac")!, 3)).toBe(3);
  expect(normalizeTileRotation(getBuildTile("decor_sofa_lilac")!, 4)).toBe(0);

  // A save on disk (written like SharedShop.flush) with a prop facing sideways: the server
  // restores the tiles and the facings when the shop's owner opens a room.
  const facingUser = uniqueUser();
  const [cellA, cellB] = buildableCells(2);
  const keyA = tileKey(cellA.cx, cellA.cy, "structure");
  const keyB = tileKey(cellB.cx, cellB.cy, "structure");
  await writeShopSave(facingUser, {
    version: 1,
    money: 300,
    decorations: [],
    tiles: { [keyA]: "pine_s", [keyB]: "bench" },
    tileRotations: { [keyA]: 1 },
  });
  await joinAsHost(page, facingUser);
  await expect.poll(async () => (await tilesOf(page))[keyA]).toBe("pine_s");
  const facings = await tileRotationsOf(page);
  expect(facings[keyA]).toBe(1); // restored from the save
  expect(facings[keyB]).toBeUndefined(); // a prop without a facing entry keeps the default

  // An old save without the tileRotations field still loads: its props just keep facing front.
  const oldCtx = await browser.newContext();
  const oldUser = uniqueUser();
  try {
    const oldPage = await oldCtx.newPage();
    await writeShopSave(oldUser, {
      version: 1,
      money: 300,
      decorations: [],
      tiles: { [keyB]: "bench" },
    });
    await joinAsHost(oldPage, oldUser);
    await expect.poll(async () => (await tilesOf(oldPage))[keyB]).toBe("bench");
    expect((await tileRotationsOf(oldPage))[keyB]).toBeUndefined();
  } finally {
    await oldCtx.close();
  }

  // Clean up this test's saves and user records.
  await rm(shopFile(facingUser), { force: true });
  await rm(userFile(facingUser), { force: true });
  await rm(shopFile(oldUser), { force: true });
  await rm(userFile(oldUser), { force: true });
});

// ---------------------------------------------------------------- T2: move / sell through the room (2 browsers)

test("T2: host move_tile moves a prop with its facing, sell_tile removes it with a 50% refund, guests and occupied targets are refused", async ({
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
    // The host opens a room; the guest joins it through the invite link.
    await joinAsHost(host, hostName);
    const roomId = await host.evaluate(() => (window as { __GAME__?: { room: { roomId: string } } }).__GAME__!.room.roomId);
    expect(roomId).toBeTruthy();
    await guest.goto(`/?test=1&room=${encodeURIComponent(roomId)}`);
    await guest.locator("#username-input").fill(guestName);
    await guest.locator("#name-form button[type=submit]").click();
    await guest.waitForFunction(() => !!(window as { __GAME__?: unknown }).__GAME__);

    // Wallets start at $0: give the host money through the admin API (mirrors live into the room).
    const patch = await request.patch(`${SERVER}/admin/users/${encodeURIComponent(hostName)}/money`, {
      headers: AUTH,
      data: { set: 500 },
    });
    expect(patch.status()).toBe(200);

    // Two pine props: A facing sideways (rotation 1), B facing front on another cell.
    const [a, b, c] = buildableCells(3);
    const keyA = tileKey(a.cx, a.cy, "structure");
    const keyB = tileKey(b.cx, b.cy, "structure");
    const keyC = tileKey(c.cx, c.cy, "structure");
    await sendTile(host, "build_tiles", { tool: "pine_s", x0: a.cx, y0: a.cy, x1: a.cx, y1: a.cy, rotation: 1 });
    await sendTile(host, "build_tiles", { tool: "pine_s", x0: b.cx, y0: b.cy, x1: b.cx, y1: b.cy, rotation: 0 });
    await expect.poll(async () => (await tilesOf(host))[keyA]).toBe("pine_s");
    await expect.poll(async () => (await tileRotationsOf(host))[keyA]).toBe(1);
    await expect.poll(async () => (await tilesOf(host))[keyB]).toBe("pine_s");
    await expect.poll(async () => (await tileRotationsOf(host))[keyB]).toBe(0);
    const moneyOf = (page: Page) =>
      page.evaluate(() => {
        const g = (window as { __GAME__?: { room: { sessionId: string }; state: { players: Map<string, { money: number }> } } }).__GAME__;
        return g?.state.players.get(g.room.sessionId)?.money ?? -1;
      });
    await expect.poll(() => moneyOf(host)).toBe(460); // 500 - 2 x $20

    // The host moves A to the empty cell C: the facing follows the prop, the old cell is empty.
    await sendTile(host, "move_tile", { cx: a.cx, cy: a.cy, toCx: c.cx, toCy: c.cy });
    await expect.poll(async () => (await tilesOf(host))[keyC]).toBe("pine_s");
    await expect.poll(async () => (await tileRotationsOf(host))[keyC]).toBe(1);
    const tiles = await tilesOf(host);
    expect(tiles[keyA]).toBeUndefined();
    expect((await tileRotationsOf(host))[keyA]).toBeUndefined();

    // A guest's move_tile is refused: the prop stays on C on both clients.
    await sendTile(guest, "move_tile", { cx: c.cx, cy: c.cy, toCx: a.cx, toCy: a.cy });
    await host.waitForTimeout(700);
    expect((await tilesOf(guest))[keyA]).toBeUndefined();
    expect((await tilesOf(guest))[keyC]).toBe("pine_s");
    expect((await tilesOf(host))[keyC]).toBe("pine_s");

    // Moving onto an occupied cell is refused: B stays where it is, the prop stays on C.
    await sendTile(host, "move_tile", { cx: c.cx, cy: c.cy, toCx: b.cx, toCy: b.cy });
    await host.waitForTimeout(700);
    const refused = await tilesOf(host);
    expect(refused[keyB]).toBe("pine_s");
    expect(refused[keyC]).toBe("pine_s");
    expect((await tileRotationsOf(host))[keyB]).toBe(0);

    // The host sells the moved prop: it disappears and 50% ($10) is refunded.
    await sendTile(host, "sell_tile", { cx: c.cx, cy: c.cy });
    await expect.poll(async () => (await tilesOf(host))[keyC]).toBeUndefined();
    await expect.poll(() => moneyOf(host)).toBe(470); // 460 + $20 x 50%
  } finally {
    await hostCtx.close();
    await guestCtx.close();
  }
});

// ---------------------------------------------------------------- T3: the build panel

test("T3: the build panel starts with no tool picked, rotatable cards carry the ⟳ badge, and re-clicking a tool unpicks it", async ({
  page,
}) => {
  await joinAsHost(page, uniqueUser());
  await expect(page.locator("#build-btn")).toBeEnabled(); // players start in the yard
  await page.locator("#build-btn").click();
  await page.locator("#build-panel .build-item").first().waitFor();

  // No tool is picked to start with.
  expect(await page.locator("#build-panel .build-item.selected").count()).toBe(0);

  // The shared ⟳ Xoay (R) button is there.
  await expect(page.locator("#build-panel .rotate-btn")).toHaveText("⟳ Xoay (R)");

  // Every tool card carries the ⟳ badge exactly when it can be turned (plus the eraser, which can't).
  const domItems = await page.evaluate(() =>
    [...document.querySelectorAll("#build-panel .build-item")].map((el) => ({
      label: el.querySelector(".name")?.textContent ?? "",
      badge: el.querySelector(".rotate-badge")?.textContent ?? "",
    })),
  );
  const expected = [
    ...BUILD_TILES.map((def) => ({ label: def.label, badge: buildRotationCount(def) > 1 ? "⟳" : "" })),
    { label: "Tẩy (kéo để dỡ)", badge: "" },
  ];
  const key = (item: { label: string; badge: string }) => `${item.label}\u0000${item.badge}`;
  expect(domItems.map(key).sort()).toStrictEqual(expected.map(key).sort());

  // Picking a tool selects it; pressing the same tool again unpicks it.
  const floor = page.locator("#build-panel .build-item", { hasText: "Sàn gỗ" });
  await floor.click();
  await expect(floor).toHaveClass(/selected/);
  expect(await page.locator("#build-panel .build-item.selected").count()).toBe(1);
  await floor.click();
  await expect(floor).not.toHaveClass(/selected/);
  expect(await page.locator("#build-panel .build-item.selected").count()).toBe(0);
});
