import { rm } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import {
  DECOR_ROOMS,
  SERVER_PORT,
  canPlaceDecoration,
  getDecorationDef,
  refundFor,
} from "@boba/shared";
import { joinAsHost, shopFile, userFile, writeShopSave } from "./helpers";

/**
 * Tabletop gadgets (task .agents/tasks/2026-11-24-gadgets-tabletop.md):
 * - T1: canPlaceDecoration only lets a tabletop gadget sit entirely on one surface, no stacking,
 *   and floor furniture ignores tabletop pieces.
 * - T2: a real host buys a table + phone, moves the table (the phone follows) and sells it
 *   (the phone is sold with it, refunding 50% of both).
 * - T3: a save restores the table and its phone, while an orphan phone (no table) is dropped.
 */

const SERVER = `http://localhost:${SERVER_PORT}`;
const ADMIN_TOKEN = "test-admin-token";
const AUTH = { Authorization: `Bearer ${ADMIN_TOKEN}` };

/** Unique per test run; shops persist per username in server/data/. */
let userSeq = 0;
const uniqueUser = () => `p1-${Date.now().toString(36)}-${userSeq++}`;

type Placed = { id: string; kind: string; x: number; y: number };

/** The part of `window.__GAME__` these tests use (full shape: client/src/testHook.ts). */
type GameHook = {
  send(type: string, payload?: unknown): void;
  state: {
    decorations: Iterable<Placed> & { length: number };
    players: Map<string, { money: number }>;
  };
  room: { sessionId: string };
};

const decorationsOf = (page: Page) =>
  page.evaluate(() => {
    const g = (window as { __GAME__?: GameHook }).__GAME__;
    return g ? Array.from(g.state.decorations, (d) => ({ id: d.id, kind: d.kind, x: d.x, y: d.y })) : [];
  });

const moneyOf = (page: Page) =>
  page.evaluate(() => {
    const g = (window as { __GAME__?: GameHook }).__GAME__;
    return g?.state.players.get(g.room.sessionId)?.money ?? -1;
  });

const sendDecor = (page: Page, type: string, payload: Record<string, number | string>) =>
  page.evaluate(([t, p]) => (window as { __GAME__?: GameHook }).__GAME__?.send(t, p), [type, payload] as const);

/** A free spot in the shop floor where a table fits, and also fits after being moved 60px right. */
function tableSpot(): { x: number; y: number } {
  const floor = DECOR_ROOMS[0].floor;
  for (let y = floor.minY; y <= floor.maxY; y += 10) {
    for (let x = floor.minX; x <= floor.maxX; x += 10) {
      if (canPlaceDecoration("table", x, y, []) && canPlaceDecoration("table", x + 60, y, [])) return { x, y };
    }
  }
  throw new Error("no free table spot in the shop floor");
}

// ---------------------------------------------------------------- T1: placement rules

test("T1: tabletop gadgets must fit entirely on one table, can't stack, and don't block floor pieces", () => {
  const table: Placed = { id: "t1", kind: "table", x: 400, y: 400, rotation: 0 };
  const p1: Placed = { id: "p1", kind: "gadget_phone", x: 400, y: 400, rotation: 0 };

  expect(canPlaceDecoration("gadget_phone", 400, 400, [table])).toBe(true); // on the table
  expect(canPlaceDecoration("gadget_phone", 460, 400, [table])).toBe(false); // off the table top
  expect(canPlaceDecoration("gadget_phone", 400, 400, [])).toBe(false); // no table under it
  expect(canPlaceDecoration("gadget_phone", 400, 400, [table, p1])).toBe(false); // stacks on p1
  expect(canPlaceDecoration("gadget_phone", 410, 400, [table, p1])).toBe(true); // beside p1, still on the table
  expect(canPlaceDecoration("table", 400, 400, [p1], "t1")).toBe(true); // floor furniture ignores tabletop pieces

  // The existing four-view TV stand keeps its views and can carry tabletop gadgets too.
  const tvStand = getDecorationDef("tv_stand")!;
  expect(tvStand.rotation).toBe("views");
  expect(tvStand.surface).toBeDefined();
});

// ---------------------------------------------------------------- T2: table moves/sells with its phone

test("T2: moving a table carries its phone, selling the table sells the phone and refunds both", async ({
  page,
  request,
}) => {
  const hostName = uniqueUser();
  try {
    await joinAsHost(page, hostName);

    const patch = await request.patch(`${SERVER}/admin/users/${encodeURIComponent(hostName)}/money`, {
      headers: AUTH,
      data: { set: 2000 },
    });
    expect(patch.status()).toBe(200);

    const { x, y } = tableSpot();
    await sendDecor(page, "buy_decoration", { kind: "table", x, y, rotation: 0 });
    await expect.poll(async () => (await decorationsOf(page)).length).toBe(1);

    await sendDecor(page, "buy_decoration", { kind: "gadget_phone", x, y, rotation: 0 });
    await expect.poll(async () => (await decorationsOf(page)).length).toBe(2);

    const table = (await decorationsOf(page)).find((d) => d.kind === "table");
    expect(table).toBeDefined();
    await sendDecor(page, "move_decoration", { id: table!.id, x: x + 60, y });
    await expect
      .poll(async () => {
        const pieces = await decorationsOf(page);
        const movedTable = pieces.find((d) => d.kind === "table");
        const phone = pieces.find((d) => d.kind === "gadget_phone");
        return movedTable && phone ? [movedTable.x, movedTable.y, phone.x, phone.y] : [];
      })
      .toStrictEqual([x + 60, y, x + 60, y]);

    await sendDecor(page, "sell_decoration", { id: table!.id });
    await expect.poll(async () => (await decorationsOf(page)).length).toBe(0);

    const tableDef = getDecorationDef("table")!;
    const phoneDef = getDecorationDef("gadget_phone")!;
    const expected = 2000 - tableDef.price - phoneDef.price + refundFor(tableDef) + refundFor(phoneDef);
    await expect.poll(() => moneyOf(page)).toBe(expected);
  } finally {
    await rm(shopFile(hostName), { force: true });
    await rm(userFile(hostName), { force: true });
  }
});

// ---------------------------------------------------------------- T3: restoring a save

test("T3: a save restores a table with its phone, and an orphan tabletop phone is dropped", async ({ browser }) => {
  const { x, y } = tableSpot();
  const userA = uniqueUser();
  const userB = uniqueUser();
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  try {
    await writeShopSave(userA, {
      version: 1,
      money: 0,
      decorations: [
        { kind: "table", x, y, rotation: 0 },
        { kind: "gadget_phone", x, y, rotation: 0 },
      ],
      tiles: {},
      tileRotations: {},
    });
    const pageA = await ctxA.newPage();
    await joinAsHost(pageA, userA);
    await expect.poll(async () => (await decorationsOf(pageA)).length).toBe(2);
    const restored = await decorationsOf(pageA);
    const tableA = restored.find((d) => d.kind === "table");
    const phoneA = restored.find((d) => d.kind === "gadget_phone");
    expect(tableA).toMatchObject({ x, y });
    expect(phoneA).toMatchObject({ x, y });

    await writeShopSave(userB, {
      version: 1,
      money: 0,
      decorations: [{ kind: "gadget_phone", x, y, rotation: 0 }],
      tiles: {},
      tileRotations: {},
    });
    const pageB = await ctxB.newPage();
    await joinAsHost(pageB, userB);
    await expect.poll(async () => (await decorationsOf(pageB)).length).toBe(0);
  } finally {
    await ctxA.close();
    await ctxB.close();
    await rm(shopFile(userA), { force: true });
    await rm(userFile(userA), { force: true });
    await rm(shopFile(userB), { force: true });
    await rm(userFile(userB), { force: true });
  }
});
