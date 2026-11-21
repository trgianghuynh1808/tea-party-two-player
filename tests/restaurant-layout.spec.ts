import { expect, test, type Page } from "@playwright/test";
import {
  PLAYER_RADIUS,
  RESTAURANT,
  RESTAURANT_SPAWN_POINTS,
  RESTAURANT_STATIONS,
  STATIONS,
  WALL_BOTTOM,
  findNearestStationDef,
  resolveCollisions,
  type Direction,
  type StationDef,
} from "@boba/shared";
import { joinAsHost, startRestaurantShift } from "./helpers";

/**
 * Layout specs for the restaurant kitchen zones (prep -> handover -> cook).
 * Station coordinates are static shared data, so these are pure Node checks; no browser needed.
 * RESTAURANT_STATIONS / RESTAURANT_SPAWN_POINTS are world-space (RESTAURANT.x/y already added),
 * so convert to the restaurant's local space before asserting.
 */

/** Beyond this local x the floor belongs to the dining room (DINING_X in client RestaurantView.ts). */
const KITCHEN_MAX_X = 990;
/** A handover counter must be within this distance of a chop board and of a cooker. */
const BRIDGE_RANGE = 160;
/** Spawn points must clear every station rect by this margin. */
const SPAWN_MARGIN = 20;

type Point = { x: number; y: number };
type Rect = { left: number; top: number; right: number; bottom: number };

const local = (p: Point): Point => ({ x: p.x - RESTAURANT.x, y: p.y - RESTAURANT.y });

const rectOf = (s: StationDef): Rect => {
  const p = local(s);
  return { left: p.x - s.width / 2, top: p.y - s.height / 2, right: p.x + s.width / 2, bottom: p.y + s.height / 2 };
};

/** Do two rects share positive area? (Merely touching edges does not count.) */
const rectsOverlap = (a: Rect, b: Rect): boolean =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/** Is the point inside the rect inflated by `margin` on every side? */
const rectContains = (r: Rect, p: Point, margin = 0): boolean =>
  p.x >= r.left - margin && p.x <= r.right + margin && p.y >= r.top - margin && p.y <= r.bottom + margin;

const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

const byIdPrefix = (prefix: string): StationDef[] => RESTAURANT_STATIONS.filter((s) => s.id.startsWith(prefix));

/** Cooking appliances of the cook zone; chop boards are prep, not cookers here. */
const COOKER_ID = /^r_(?:fry|boil|grill|bake|deepfry|blend|brew)_\d+$/;
const cookers = (): StationDef[] => RESTAURANT_STATIONS.filter((s) => COOKER_ID.test(s.id));

test("T1: every station stays inside the kitchen and no two stations overlap", () => {
  expect(RESTAURANT_STATIONS.length).toBeGreaterThan(0);
  for (const s of RESTAURANT_STATIONS) {
    const p = local(s);
    expect(p.x, `${s.id} local x within the kitchen`).toBeGreaterThanOrEqual(0);
    expect(p.x, `${s.id} local x within the kitchen`).toBeLessThan(KITCHEN_MAX_X);
    expect(p.y, `${s.id} local y below the back wall`).toBeGreaterThanOrEqual(WALL_BOTTOM);
  }
  for (let i = 0; i < RESTAURANT_STATIONS.length; i++) {
    for (let j = i + 1; j < RESTAURANT_STATIONS.length; j++) {
      const a = RESTAURANT_STATIONS[i];
      const b = RESTAURANT_STATIONS[j];
      expect(rectsOverlap(rectOf(a), rectOf(b)), `${a.id} overlaps ${b.id}`).toBe(false);
    }
  }
});

test("T2: zone order is prep (crates + boards) < handover counters < cook (cookers + shelves)", () => {
  const prep = [...byIdPrefix("r_crate_"), ...byIdPrefix("r_chop_")];
  const counters = byIdPrefix("r_counter_");
  const cook = [...cookers(), ...byIdPrefix("r_shelf_")];
  expect(prep.length).toBeGreaterThan(0);
  expect(counters.length).toBeGreaterThan(0);
  expect(cook.length).toBeGreaterThan(0);

  const maxPrepX = Math.max(...prep.map((s) => local(s).x));
  const minCookX = Math.min(...cook.map((s) => local(s).x));
  for (const s of counters) {
    const x = local(s).x;
    expect(x, `${s.id} right of the prep zone`).toBeGreaterThan(maxPrepX);
    expect(x, `${s.id} left of the cook zone`).toBeLessThan(minCookX);
  }
});

test("T3: the handover column is reachable from both sides", () => {
  const counters = byIdPrefix("r_counter_");
  expect(counters.length, "exactly six handover counters").toBe(6);
  expect(new Set(counters.map((s) => local(s).x)).size, "counters share one column").toBe(1);

  const boards = byIdPrefix("r_chop_");
  const appliances = cookers();
  const bridging = counters.filter(
    (c) =>
      boards.some((b) => dist(local(c), local(b)) <= BRIDGE_RANGE) &&
      appliances.some((k) => dist(local(c), local(k)) <= BRIDGE_RANGE),
  );
  expect(bridging.length, "counters within reach of a board and a cooker").toBeGreaterThanOrEqual(3);
});

test("T4: restaurant spawn points are valid", () => {
  expect(RESTAURANT_SPAWN_POINTS.length).toBeGreaterThan(0);
  for (const raw of RESTAURANT_SPAWN_POINTS) {
    const p = local(raw);
    expect(p.x, "spawn local x inside the kitchen").toBeGreaterThanOrEqual(0);
    expect(p.x, "spawn local x inside the kitchen").toBeLessThan(KITCHEN_MAX_X);
    expect(p.y, "spawn local y below the back wall").toBeGreaterThanOrEqual(WALL_BOTTOM);
    for (const s of RESTAURANT_STATIONS) {
      expect(rectContains(rectOf(s), p, SPAWN_MARGIN), `spawn point inside ${s.id} (+margin)`).toBe(false);
    }
  }
});

let userSeq = 0;
const uniqueUser = (prefix = "p") => `${prefix}-${Date.now()}-${userSeq++}`;

/** Join an existing room by id as the second player in e2e test mode. */
async function joinRoomAsGuest(page: Page, roomId: string, username: string): Promise<void> {
  await page.goto(`/?test=1&room=${encodeURIComponent(roomId)}`);
  await page.locator("#username-input").fill(username);
  await page.locator("#name-form button[type=submit]").click();
  await page.waitForFunction(() => !!(window as { __GAME__?: unknown }).__GAME__);
}

/** Walk the local player along local-coordinate waypoints inside the restaurant via `window.__GAME__`. */
async function walkRestaurantPath(page: Page, waypoints: [number, number][], dir: Direction = "up"): Promise<void> {
  await page.evaluate(
    async ({ pts, direction }) => {
      type Hook = {
        room: { sessionId: string };
        send(type: string, payload?: unknown): void;
        state: { players: { get(id: string): { x: number; y: number; teleportSeq: number } } };
      };
      const g = (window as unknown as { __GAME__: Hook }).__GAME__;
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      for (const [lx, ly] of pts) {
        const tx = 1400 + lx;
        const ty = ly;
        for (let step = 0; step < 40; step++) {
          const me = g.state.players.get(g.room.sessionId);
          const dx = tx - me.x;
          const dy = ty - me.y;
          const d = Math.hypot(dx, dy);
          if (d < 1.5) break;
          const move = Math.min(d, 55);
          g.send("position", {
            x: me.x + (dx / d) * move,
            y: me.y + (dy / d) * move,
            direction,
            teleportSeq: me.teleportSeq,
          });
          await sleep(55);
        }
      }
    },
    { pts: waypoints, direction: dir },
  );
}

test("T5: starting a 2-player restaurant shift spawns both players at RESTAURANT_SPAWN_POINTS and keeps tea shop stations intact", async ({
  browser,
}) => {
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  try {
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();
    await joinAsHost(page1, uniqueUser("p1"));
    const roomId = await page1.evaluate(
      () => (window as unknown as { __GAME__: { room: { roomId: string } } }).__GAME__.room.roomId,
    );
    await joinRoomAsGuest(page2, roomId, uniqueUser("p2"));

    await page1.evaluate(() =>
      (window as unknown as { __GAME__: { send(t: string, p?: unknown): void } }).__GAME__.send("start_shift", {
        venue: "restaurant",
      }),
    );
    await page1.waitForFunction(
      () =>
        (window as unknown as { __GAME__?: { state?: { phase?: string; venue?: string } } }).__GAME__?.state?.phase ===
          "playing" &&
        (window as unknown as { __GAME__?: { state?: { phase?: string; venue?: string } } }).__GAME__?.state?.venue ===
          "restaurant",
    );

    const snapshot = await page1.evaluate(() => {
      type State = {
        players: { forEach(cb: (p: { x: number; y: number }) => void): void };
        stations: { forEach(cb: (s: { id: string; x: number; y: number }, id: string) => void): void };
      };
      const state = (window as unknown as { __GAME__: { state: State } }).__GAME__.state;
      const players: { x: number; y: number }[] = [];
      state.players.forEach((p) => players.push({ x: p.x, y: p.y }));
      const stations: Record<string, { x: number; y: number }> = {};
      state.stations.forEach((s, id) => {
        stations[id] = { x: s.x, y: s.y };
      });
      return { players, stations };
    });

    expect(snapshot.players).toEqual(RESTAURANT_SPAWN_POINTS.map((p) => ({ x: p.x, y: p.y })));
    for (const def of RESTAURANT_STATIONS) {
      expect(snapshot.stations[def.id], `restaurant station ${def.id}`).toEqual({ x: def.x, y: def.y });
    }
    for (const def of STATIONS) {
      expect(snapshot.stations[def.id], `tea shop station ${def.id} untouched`).toEqual({ x: def.x, y: def.y });
    }
  } finally {
    await ctx1.close();
    await ctx2.close();
  }
});

test("T6: two players can collaborate across the one-way prep -> handover -> cook + plate zones", async ({
  browser,
}) => {
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  try {
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();
    await joinAsHost(page1, uniqueUser("p1"));
    const roomId = await page1.evaluate(
      () => (window as unknown as { __GAME__: { room: { roomId: string } } }).__GAME__.room.roomId,
    );
    await joinRoomAsGuest(page2, roomId, uniqueUser("p2"));

    await page1.evaluate(() =>
      (window as unknown as { __GAME__: { send(t: string, p?: unknown): void } }).__GAME__.send("start_shift", {
        venue: "restaurant",
      }),
    );
    await page1.waitForFunction(
      () =>
        (window as unknown as { __GAME__?: { state?: { phase?: string } } }).__GAME__?.state?.phase === "playing",
    );

    const interact = (page: Page) =>
      page.evaluate(() =>
        (window as unknown as { __GAME__: { send(t: string): void } }).__GAME__.send("interact"),
      );
    const heldOf = (page: Page) =>
      page.evaluate(() => {
        const g = (
          window as unknown as {
            __GAME__: { room: { sessionId: string }; state: { players: { get(id: string): { heldItem: string } } } };
          }
        ).__GAME__;
        return g.state.players.get(g.room.sessionId).heldItem;
      });
    const stationItemOf = (page: Page, id: string) =>
      page.evaluate(
        (stationId) =>
          (
            window as unknown as {
              __GAME__: { state: { stations: { get(k: string): { item: string } } } };
            }
          ).__GAME__.state.stations.get(stationId).item,
        id,
      );

    // Player 1 (prep zone): pick potato -> chop on r_chop_1 -> place on handover counter r_counter_1.
    await walkRestaurantPath(
      page1,
      [
        [404, 630],
        [404, 128],
        [129, 128],
      ],
      "down",
    );
    await interact(page1);
    await expect.poll(() => heldOf(page1)).toBe("food:potato");

    await walkRestaurantPath(
      page1,
      [
        [404, 128],
        [400, 230],
      ],
      "left",
    );
    await interact(page1);
    await expect.poll(() => stationItemOf(page1, "r_chop_1")).toBe("food:potato.chop");
    await interact(page1);
    await expect.poll(() => heldOf(page1)).toBe("food:potato.chop");

    await walkRestaurantPath(page1, [[408, 200]], "right");
    await interact(page1);
    await expect.poll(() => stationItemOf(page1, "r_counter_1")).toBe("food:potato.chop");
    await expect.poll(() => heldOf(page1)).toBe("");

    // Player 2 (cook zone): pick chopped potato from r_counter_1 -> deepfry at r_deepfry_1 -> grab plate at r_shelf_plate -> scoop fries onto plate.
    await walkRestaurantPath(
      page2,
      [
        [506, 630],
        [506, 200],
      ],
      "left",
    );
    await interact(page2);
    await expect.poll(() => heldOf(page2)).toBe("food:potato.chop");

    await walkRestaurantPath(page2, [[660, 240]], "down");
    await interact(page2);
    await walkRestaurantPath(
      page2,
      [
        [506, 240],
        [506, 450],
        [570, 450],
      ],
      "down",
    );
    await interact(page2);
    await expect.poll(() => heldOf(page2)).toBe("plate");

    await expect.poll(() => stationItemOf(page2, "r_deepfry_1")).toBe("food:potato.chop.deepfry");
    await walkRestaurantPath(
      page2,
      [
        [506, 450],
        [506, 240],
        [660, 240],
      ],
      "down",
    );
    await interact(page2);
    await expect.poll(() => heldOf(page2)).toBe("plate:potato.chop.deepfry");
  } finally {
    await ctx1.close();
    await ctx2.close();
  }
});

test("T7: every kitchen station is reachable on foot from the restaurant spawn points and selectable within INTERACT_RANGE", () => {
  const step = 2;
  const snap = (v: number) => Math.round(v / step) * step;
  const keyOf = (lx: number, ly: number) => `${lx},${ly}`;
  const isWalkable = (lx: number, ly: number): boolean => {
    const world = { x: RESTAURANT.x + lx, y: RESTAURANT.y + ly };
    const resolved = resolveCollisions(world);
    return Math.hypot(resolved.x - world.x, resolved.y - world.y) < 0.5;
  };

  const visited = new Set<string>();
  const queue: [number, number][] = [];
  for (const raw of RESTAURANT_SPAWN_POINTS) {
    const p = local(raw);
    const sx = snap(p.x);
    const sy = snap(p.y);
    if (isWalkable(sx, sy)) {
      visited.add(keyOf(sx, sy));
      queue.push([sx, sy]);
    }
  }

  const reachableStations = new Set<string>();
  while (queue.length > 0) {
    const [lx, ly] = queue.shift()!;
    const nearest = findNearestStationDef({ x: RESTAURANT.x + lx, y: RESTAURANT.y + ly });
    if (nearest) reachableStations.add(nearest.id);

    for (const [dx, dy] of [
      [step, 0],
      [-step, 0],
      [0, step],
      [0, -step],
    ] as const) {
      const nx = lx + dx;
      const ny = ly + dy;
      if (nx < PLAYER_RADIUS || nx >= KITCHEN_MAX_X || ny < WALL_BOTTOM || ny > RESTAURANT.height - PLAYER_RADIUS) {
        continue;
      }
      const k = keyOf(nx, ny);
      if (visited.has(k)) continue;
      visited.add(k);
      if (isWalkable(nx, ny)) queue.push([nx, ny]);
    }
  }

  const unreachable = RESTAURANT_STATIONS.map((s) => s.id).filter((id) => !reachableStations.has(id));
  expect(unreachable, "stations unreachable on foot from spawn").toEqual([]);
});

test("T8: every x-adjacent station pair in the prep zone leaves a 44px aisle (the player is 36px wide)", () => {
  const MIN_AISLE = 44;
  const prep = [...byIdPrefix("r_crate_"), ...byIdPrefix("r_chop_")];
  expect(prep.length).toBeGreaterThan(0);
  for (let i = 0; i < prep.length; i++) {
    for (let j = i + 1; j < prep.length; j++) {
      const a = rectOf(prep[i]);
      const b = rectOf(prep[j]);
      // Only stations sharing a vertical lane need a walking aisle between them.
      if (!(a.top < b.bottom && b.top < a.bottom)) continue;
      const gap = a.right <= b.left ? b.left - a.right : b.right <= a.left ? a.left - b.right : 0;
      expect(gap, `${prep[i].id} <-> ${prep[j].id} aisle`).toBeGreaterThanOrEqual(MIN_AISLE);
    }
  }
});

test("T10: adjacent crates in the same column leave a 40px vertical gap; no stations overlap and all stay on the floor", () => {
  const MIN_GAP = 40;
  const crates = byIdPrefix("r_crate_");
  expect(crates.length).toBeGreaterThan(0);

  const columns = new Map<number, StationDef[]>();
  for (const c of crates) {
    const x = local(c).x;
    const column = columns.get(x);
    if (column) column.push(c);
    else columns.set(x, [c]);
  }
  for (const [x, column] of columns) {
    expect(column.length, `column x=${x} has at least two crates`).toBeGreaterThanOrEqual(2);
    column.sort((a, b) => local(a).y - local(b).y);
    for (let i = 1; i < column.length; i++) {
      const gap = rectOf(column[i]).top - rectOf(column[i - 1]).bottom;
      expect(gap, `column x=${x}: ${column[i - 1].id} <-> ${column[i].id} vertical gap`).toBeGreaterThanOrEqual(MIN_GAP);
    }
  }

  for (const s of RESTAURANT_STATIONS) {
    expect(rectOf(s).bottom, `${s.id} stays on the floor`).toBeLessThanOrEqual(RESTAURANT.height);
  }
  for (let i = 0; i < RESTAURANT_STATIONS.length; i++) {
    for (let j = i + 1; j < RESTAURANT_STATIONS.length; j++) {
      const a = RESTAURANT_STATIONS[i];
      const b = RESTAURANT_STATIONS[j];
      expect(rectsOverlap(rectOf(a), rectOf(b)), `${a.id} overlaps ${b.id}`).toBe(false);
    }
  }
});

test("T11: the station in the player's facing direction wins over the plain nearest one", () => {
  // The aisle between the cooker rows: r_boil_1 (local 750,145) is 43px away, r_blend_1 (local 750,290)
  // is 42px away, so without facing the blender wins and only facing decides.
  const boilAisle = { x: RESTAURANT.x + 750, y: RESTAURANT.y + 218 };
  expect(findNearestStationDef(boilAisle)?.id).toBe("r_blend_1");
  expect(findNearestStationDef(boilAisle, "up")?.id).toBe("r_boil_1");
  expect(findNearestStationDef(boilAisle, "down")?.id).toBe("r_blend_1");

  // The 40px vertical gap between the shrimp (local 31,434) and egg (local 31,522) crates, ~20px from each.
  const crateGap = { x: RESTAURANT.x + 31, y: RESTAURANT.y + 477 };
  expect(findNearestStationDef(crateGap, "up")?.id).toBe("r_crate_shrimp");
  expect(findNearestStationDef(crateGap, "down")?.id).toBe("r_crate_egg");
});

test("T9: a player can walk into the vertical gaps between crates to pick shrimp from column 1 and tomato from column 2", async ({
  page,
}) => {
  await joinAsHost(page, uniqueUser("p1"));
  await page.evaluate(() =>
    (window as unknown as { __GAME__: { send(t: string, p?: unknown): void } }).__GAME__.send("start_shift", {
      venue: "restaurant",
    }),
  );
  await page.waitForFunction(
    () =>
      (window as unknown as { __GAME__?: { state?: { phase?: string; venue?: string } } }).__GAME__?.state?.phase ===
        "playing" &&
      (window as unknown as { __GAME__?: { state?: { phase?: string; venue?: string } } }).__GAME__?.state?.venue ===
        "restaurant",
  );

  const interact = () =>
    page.evaluate(() =>
      (window as unknown as { __GAME__: { send(t: string): void } }).__GAME__.send("interact"),
    );
  const heldOf = () =>
    page.evaluate(() => {
      const g = (
        window as unknown as {
          __GAME__: { room: { sessionId: string }; state: { players: { get(id: string): { heldItem: string } } } };
        }
      ).__GAME__;
      return g.state.players.get(g.room.sessionId).heldItem;
    });

  // Column 1 (x = 31): along the bottom edge (the y = 630 row is now blocked by the rice crate at
  // x = 129, y = 610), up aisle 1 (x = 76), then step into the 40px vertical gap between the
  // shrimp (y = 434) and egg (y = 522) crates.
  await walkRestaurantPath(
    page,
    [
      [470, 742],
      [76, 742],
      [76, 477],
      [31, 477],
    ],
    "left",
  );
  await interact();
  await expect.poll(heldOf).toBe("food:shrimp");

  // Discard at the trash (330, 712), now at the bottom of the prep zone.
  await walkRestaurantPath(
    page,
    [
      [76, 477],
      [76, 742],
      [280, 742],
    ],
    "down",
  );
  await interact();
  await expect.poll(heldOf).toBe("");

  // Column 2 (x = 129): up aisle 2 (x = 174), then step into the vertical gap between the
  // tomato (y = 258) and lettuce (y = 346) crates.
  await walkRestaurantPath(
    page,
    [
      [174, 742],
      [174, 301],
      [129, 301],
    ],
    "left",
  );
  await interact();
  await expect.poll(heldOf).toBe("food:tomato");
});

test("T12: the server picks the crate the player faces, one independent room per facing", async ({ browser }) => {
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  try {
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();
    await joinAsHost(page1, uniqueUser("p1"));
    await joinAsHost(page2, uniqueUser("p2"));
    await startRestaurantShift(page1);
    await startRestaurantShift(page2);

    const interact = (page: Page) =>
      page.evaluate(() => (window as unknown as { __GAME__: { send(t: string): void } }).__GAME__.send("interact"));
    const heldOf = (page: Page) =>
      page.evaluate(() => {
        const g = (
          window as unknown as {
            __GAME__: { room: { sessionId: string }; state: { players: { get(id: string): { heldItem: string } } } };
          }
        ).__GAME__;
        return g.state.players.get(g.room.sessionId).heldItem;
      });

    // Both players stand in the 40px gap between the shrimp (local 31,434) and egg (local 31,522) crates,
    // ~20px from each: only the facing direction tells the two picks apart.
    const crateGapPath: [number, number][] = [
      [470, 742],
      [76, 742],
      [76, 477],
      [31, 477],
    ];
    await walkRestaurantPath(page1, crateGapPath, "up");
    await interact(page1);
    await expect.poll(() => heldOf(page1)).toBe("food:shrimp");

    await walkRestaurantPath(page2, crateGapPath, "down");
    await interact(page2);
    await expect.poll(() => heldOf(page2)).toBe("food:egg");
  } finally {
    await ctx1.close();
    await ctx2.close();
  }
});

test('T1: empty counters show no "Bàn" label while functional stations keep theirs', async ({ page }) => {
  await joinAsHost(page, uniqueUser("p1"));

  const stationLabels = () =>
    page.evaluate(() =>
      (window as unknown as { __GAME__: { stationLabels(): string[] } }).__GAME__.stationLabels(),
    );

  // The hook is installed before the scene boots: wait until the stations have created their labels.
  await expect.poll(async () => (await stationLabels()).length).toBeGreaterThan(0);
  const labels = await stationLabels();
  expect(labels.some((label) => label.includes("Bàn")), "no counter keeps its Bàn label").toBe(false);
  expect(labels.some((label) => label.includes("Giao hàng")), "functional stations keep their label").toBe(true);
});
