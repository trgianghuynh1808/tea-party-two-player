import { rm } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import {
  DECORATION_CATALOG,
  DECOR_ROOMS,
  canPlaceDecoration,
  getDecorationDef,
} from "@boba/shared";
import { joinAsHost, shopFile, userFile, writeShopSave } from "./helpers";

/**
 * Task .agents/tasks/2026-11-28-task-37-ban-hay-xoa-dien-thoai-va-tablet-trong-n.md:
 * - T1: the catalog no longer carries the phone/tablet gadgets, the tabletop layer or the
 *   surface field, while ordinary gadget furniture (TV stand, piano) stays.
 * - T2: an old save with a phone/tablet on a table still loads; the gadgets are dropped and
 *   the table stays where it was.
 */

/** Unique per test run; shops persist per username in server/data/. */
let userSeq = 0;
const uniqueUser = () => `p1-${Date.now().toString(36)}-${userSeq++}`;

type Placed = { id: string; kind: string; x: number; y: number };

/** The part of `window.__GAME__` these tests use (full shape: client/src/testHook.ts). */
type GameHook = {
  state: { decorations: Iterable<Placed> & { length: number } };
};

const decorationsOf = (page: Page) =>
  page.evaluate(() => {
    const g = (window as { __GAME__?: GameHook }).__GAME__;
    return g ? Array.from(g.state.decorations, (d) => ({ id: d.id, kind: d.kind, x: d.x, y: d.y })) : [];
  });

/** A free spot in the shop floor where a table fits. */
function tableSpot(): { x: number; y: number } {
  const floor = DECOR_ROOMS[0].floor;
  for (let y = floor.minY; y <= floor.maxY; y += 10) {
    for (let x = floor.minX; x <= floor.maxX; x += 10) {
      if (canPlaceDecoration("table", x, y, [])) return { x, y };
    }
  }
  throw new Error("no free table spot in the shop floor");
}

// ---------------------------------------------------------------- T1: clean catalog

test("T1: phone/tablet gadgets and the tabletop layer are gone from the catalog", () => {
  expect(getDecorationDef("gadget_phone")).toBeUndefined();
  expect(getDecorationDef("gadget_tablet")).toBeUndefined();

  for (const def of DECORATION_CATALOG) {
    expect(def.layer).not.toBe("tabletop");
    expect((def as Record<string, unknown>).surface).toBeUndefined();
  }

  expect(getDecorationDef("tv_stand_wood")).toBeDefined();
  expect(getDecorationDef("piano_grand")).toBeDefined();
});

// ---------------------------------------------------------------- T2: restoring an old save

test("T2: an old save keeps its table and drops the phone/tablet", async ({ page }) => {
  const hostName = uniqueUser();
  const { x, y } = tableSpot();
  try {
    await writeShopSave(hostName, {
      version: 1,
      money: 0,
      decorations: [
        { kind: "table", x, y, rotation: 0 },
        { kind: "gadget_phone", x, y, rotation: 0 },
        { kind: "gadget_tablet", x, y, rotation: 0 },
      ],
      tiles: {},
      tileRotations: {},
    });

    await joinAsHost(page, hostName);

    await expect.poll(async () => (await decorationsOf(page)).length).toBe(1);
    const pieces = await decorationsOf(page);
    expect(pieces).toHaveLength(1);
    expect(pieces[0]).toMatchObject({ kind: "table", x, y });
    expect(pieces.some((d) => d.kind.startsWith("gadget_"))).toBe(false);
  } finally {
    await rm(shopFile(hostName), { force: true });
    await rm(userFile(hostName), { force: true });
  }
});
