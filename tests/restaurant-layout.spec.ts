import { expect, test, type Page } from "@playwright/test";
import {
  INTERACT_RANGE,
  PLAYER_RADIUS,
  RESTAURANT,
  RESTAURANT_ENTRY_SPAWN,
  RESTAURANT_EXIT_ZONE,
  RESTAURANT_SPAWN_POINTS,
  RESTAURANT_STATIONS,
  STATIONS,
  WALL_BOTTOM,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  distanceToStation,
  findNearestStationDef,
  resolveCollisions,
  StationType,
  type Direction,
  type StationDef,
} from "@boba/shared";
import { joinAsHost, startRestaurantShift } from "./helpers";

/**
 * Layout specs for the restaurant's edge kitchen: the 21 ingredient crates in one row along the back
 * wall, the savory cookers in a two-column galley down the left edge with a 70px aisle between its
 * columns, the drink-side cookers in one column down the right edge, the shelves / handover
 * counters / take-away counter / trash in one row along the bottom, and the open middle left clear
 * for dining.
 * The shape and reachability checks are pure Node (station coordinates are static shared data); the
 * collaboration checks drive two browser sessions through window.__GAME__.
 * RESTAURANT_STATIONS / RESTAURANT_SPAWN_POINTS are world-space (RESTAURANT.x/y already added),
 * so convert to the restaurant's local space before asserting.
 */

/** Spawn / entry points must clear every station rect by this margin. */
const SPAWN_MARGIN = 20;
/** The wooden dining middle (local px, mirrors DINING_RECT in client RestaurantView.ts): no station inside. */
const DINING_RECT: Rect = { left: 280, top: 230, right: 1250, bottom: 660 };
/** The door gap in the bottom row (local px): no station inside. The crate row above may cross it. */
const DOOR_GAP_RECT: Rect = { left: 640, top: 685, right: 760, bottom: RESTAURANT.height };

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

const station = (id: string): StationDef => {
  const def = RESTAURANT_STATIONS.find((s) => s.id === id);
  if (!def) throw new Error(`missing station ${id}`);
  return def;
};

test("edge-layout T1: crates form one row on top, the savory cookers fill the left galley and the drink ones the right column, the rest one bottom row; door gap and dining middle clear", () => {
  const crates = RESTAURANT_STATIONS.filter((s) => s.type === StationType.Crate);
  expect(crates.length, "21 ingredient crates").toBe(21);
  for (const c of crates) {
    expect(local(c).y, `${c.id} sits on the crate row`).toBe(170);
  }

  const cookers = RESTAURANT_STATIONS.filter((s) => s.type === StationType.Cooker);
  expect(cookers.length, "11 cookers across the galley and the right column").toBe(11);
  for (const k of cookers) {
    expect([60, 214, 1340], `${k.id} in the galley's outer or inner column, or the right column`).toContain(local(k).x);
  }

  // The savory machines all sit in the left galley now; the right column keeps only the drink ones.
  expect(local(station("r_bake_1")).x, "r_bake_1 moved into the left galley").toBeLessThan(400);
  expect(local(station("r_deepfry_1")).x, "r_deepfry_1 moved into the left galley").toBeLessThan(400);
  const rightColumn = cookers.filter((k) => local(k).x === 1340).map((k) => k.id);
  expect(rightColumn, "the right column is drink-side only").toEqual(["r_chop_2", "r_blend_1", "r_brew_1"]);

  // Machines stacked in one column leave a usable vertical gap...
  const columns = new Map<number, Rect[]>();
  for (const k of cookers) {
    const x = local(k).x;
    columns.set(x, [...(columns.get(x) ?? []), rectOf(k)]);
  }
  for (const [x, rects] of columns) {
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const [upper, lower] = rects[i].top < rects[j].top ? [rects[i], rects[j]] : [rects[j], rects[i]];
        expect(lower.top - upper.bottom, `vertical gap between the cookers stacked at x=${x}`).toBeGreaterThanOrEqual(24);
      }
    }
  }

  // ...and the galley's two columns leave a 70px aisle between them.
  const outerRight = Math.max(...(columns.get(60) ?? []).map((r) => r.right));
  const innerLeft = Math.min(...(columns.get(214) ?? []).map((r) => r.left));
  expect(innerLeft - outerRight, "aisle between the galley's outer and inner columns").toBe(70);

  const bottomRow = RESTAURANT_STATIONS.filter(
    (s) =>
      s.type === StationType.Shelf ||
      s.type === StationType.Counter ||
      s.type === StationType.DeliveryCounter ||
      s.type === StationType.Trash,
  );
  expect(bottomRow.length, "3 shelves + 6 counters + delivery + trash").toBe(11);
  for (const s of bottomRow) {
    expect(local(s).y, `${s.id} on the bottom row`).toBeGreaterThanOrEqual(685);
  }

  // The door gap and the wooden dining middle stay free of stations.
  for (const s of RESTAURANT_STATIONS) {
    expect(rectsOverlap(rectOf(s), DOOR_GAP_RECT), `${s.id} blocks the door gap`).toBe(false);
    expect(rectsOverlap(rectOf(s), DINING_RECT), `${s.id} stands in the dining middle`).toBe(false);
  }

  // Everything inside the room, nothing overlapping.
  for (const s of RESTAURANT_STATIONS) {
    const r = rectOf(s);
    expect(r.left, `${s.id} inside the room`).toBeGreaterThanOrEqual(0);
    expect(r.top, `${s.id} below the back wall`).toBeGreaterThanOrEqual(WALL_BOTTOM);
    expect(r.right, `${s.id} inside the room`).toBeLessThanOrEqual(RESTAURANT.width);
    expect(r.bottom, `${s.id} on the floor`).toBeLessThanOrEqual(RESTAURANT.height);
  }
  for (let i = 0; i < RESTAURANT_STATIONS.length; i++) {
    for (let j = i + 1; j < RESTAURANT_STATIONS.length; j++) {
      const a = RESTAURANT_STATIONS[i];
      const b = RESTAURANT_STATIONS[j];
      expect(rectsOverlap(rectOf(a), rectOf(b)), `${a.id} overlaps ${b.id}`).toBe(false);
    }
  }
});

test("edge-layout T2: from the spawns and the entry, every station has a walkable stand within INTERACT_RANGE; spawns and exit clear of stations", () => {
  const step = 2;
  const snap = (v: number) => Math.round(v / step) * step;
  const keyOf = (lx: number, ly: number) => `${lx},${ly}`;
  const isWalkable = (lx: number, ly: number): boolean => {
    const world = { x: RESTAURANT.x + lx, y: RESTAURANT.y + ly };
    const resolved = resolveCollisions(world);
    return Math.hypot(resolved.x - world.x, resolved.y - world.y) < 0.5;
  };

  // Flood the room on foot from the shift spawns and the door's entry spawn (T7's walk grid).
  const starts = [...RESTAURANT_SPAWN_POINTS, RESTAURANT_ENTRY_SPAWN].map(local);
  const visited = new Set<string>();
  const queue: [number, number][] = [];
  for (const p of starts) {
    const sx = snap(p.x);
    const sy = snap(p.y);
    if (isWalkable(sx, sy) && !visited.has(keyOf(sx, sy))) {
      visited.add(keyOf(sx, sy));
      queue.push([sx, sy]);
    }
  }

  const inRange = new Set<string>();
  const checkRange = (lx: number, ly: number) => {
    const world = { x: RESTAURANT.x + lx, y: RESTAURANT.y + ly };
    for (const s of RESTAURANT_STATIONS) {
      const r = rectOf(s);
      // Cheap bounding-box skip before the exact distance.
      if (lx < r.left - INTERACT_RANGE || lx > r.right + INTERACT_RANGE || ly < r.top - INTERACT_RANGE || ly > r.bottom + INTERACT_RANGE) {
        continue;
      }
      if (distanceToStation(world, s) <= INTERACT_RANGE) inRange.add(s.id);
    }
  };
  while (queue.length > 0) {
    const [lx, ly] = queue.shift()!;
    checkRange(lx, ly);
    for (const [dx, dy] of [
      [step, 0],
      [-step, 0],
      [0, step],
      [0, -step],
    ] as const) {
      const nx = lx + dx;
      const ny = ly + dy;
      if (nx < PLAYER_RADIUS || nx >= RESTAURANT.width - PLAYER_RADIUS || ny < WALL_BOTTOM || ny > RESTAURANT.height - PLAYER_RADIUS) {
        continue;
      }
      const k = keyOf(nx, ny);
      if (visited.has(k)) continue;
      visited.add(k);
      if (isWalkable(nx, ny)) queue.push([nx, ny]);
    }
  }

  const unreachable = RESTAURANT_STATIONS.map((s) => s.id).filter((id) => !inRange.has(id));
  expect(unreachable, "no station has a walkable stand within INTERACT_RANGE").toEqual([]);

  // Neither the shift spawns nor the entry spawn sits on a station, and the exit mat touches none.
  for (const p of starts) {
    for (const s of RESTAURANT_STATIONS) {
      expect(rectContains(rectOf(s), p, SPAWN_MARGIN), `spawn/entry point inside ${s.id} (+margin)`).toBe(false);
    }
  }
  const exitLocal: Rect = {
    left: RESTAURANT_EXIT_ZONE.left - RESTAURANT.x,
    top: RESTAURANT_EXIT_ZONE.top - RESTAURANT.y,
    right: RESTAURANT_EXIT_ZONE.right - RESTAURANT.x,
    bottom: RESTAURANT_EXIT_ZONE.bottom - RESTAURANT.y,
  };
  for (const s of RESTAURANT_STATIONS) {
    expect(rectsOverlap(exitLocal, rectOf(s)), `${s.id} blocks the exit mat`).toBe(false);
  }
});

test("T4: restaurant spawn points are valid", () => {
  expect(RESTAURANT_SPAWN_POINTS.length).toBeGreaterThan(0);
  for (const raw of RESTAURANT_SPAWN_POINTS) {
    const p = local(raw);
    expect(p.x, "spawn local x inside the room").toBeGreaterThanOrEqual(0);
    expect(p.x, "spawn local x inside the room").toBeLessThan(RESTAURANT.width);
    expect(p.y, "spawn local y below the back wall").toBeGreaterThanOrEqual(WALL_BOTTOM);
    for (const s of RESTAURANT_STATIONS) {
      expect(rectContains(rectOf(s), p, SPAWN_MARGIN), `spawn point inside ${s.id} (+margin)`).toBe(false);
    }
  }
});

test("T7: every restaurant station is reachable on foot from the restaurant spawn points and selectable within INTERACT_RANGE", () => {
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
      if (nx < PLAYER_RADIUS || nx >= RESTAURANT.width - PLAYER_RADIUS || ny < WALL_BOTTOM || ny > RESTAURANT.height - PLAYER_RADIUS) {
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

test("T2: tea shop machines leave a 30px gap and counters a 40px gap, clear of the delivery counter", () => {
  const shopRectOf = (s: StationDef): Rect => ({
    left: s.x - s.width / 2,
    top: s.y - s.height / 2,
    right: s.x + s.width / 2,
    bottom: s.y + s.height / 2,
  });

  const machines = STATIONS.filter((s) => s.type === StationType.Machine || s.type === StationType.CupShelf).sort(
    (a, b) => a.x - b.x,
  );
  expect(machines.length, "cup shelf + six machines").toBe(7);
  for (let i = 1; i < machines.length; i++) {
    const gap = shopRectOf(machines[i]).left - shopRectOf(machines[i - 1]).right;
    expect(gap, `${machines[i - 1].id} <-> ${machines[i].id} gap`).toBeGreaterThanOrEqual(30);
  }

  const counters = STATIONS.filter((s) => s.type === StationType.Counter).sort((a, b) => a.x - b.x);
  expect(counters.length, "five handover counters").toBe(5);
  for (let i = 1; i < counters.length; i++) {
    const gap = shopRectOf(counters[i]).left - shopRectOf(counters[i - 1]).right;
    expect(gap, `${counters[i - 1].id} <-> ${counters[i].id} gap`).toBeGreaterThanOrEqual(40);
  }

  // Nothing overlaps (the delivery counter in particular) and every station fits the 960x600 frame.
  expect(STATIONS.find((s) => s.type === StationType.DeliveryCounter), "delivery counter exists").toBeDefined();
  for (let i = 0; i < STATIONS.length; i++) {
    const a = shopRectOf(STATIONS[i]);
    expect(a.left, `${STATIONS[i].id} inside the frame`).toBeGreaterThanOrEqual(0);
    expect(a.right, `${STATIONS[i].id} inside the frame`).toBeLessThanOrEqual(WORLD_WIDTH);
    expect(a.top, `${STATIONS[i].id} inside the frame`).toBeGreaterThanOrEqual(0);
    expect(a.bottom, `${STATIONS[i].id} inside the frame`).toBeLessThanOrEqual(WORLD_HEIGHT);
    for (let j = i + 1; j < STATIONS.length; j++) {
      expect(rectsOverlap(a, shopRectOf(STATIONS[j])), `${STATIONS[i].id} overlaps ${STATIONS[j].id}`).toBe(false);
    }
  }
});

test("T11: the station in the player's facing direction wins over the plain nearest one", () => {
  // The 30px gap between r_chop_1 and r_fry_1 in the galley's outer column: standing 3px below the
  // board, r_chop_1 is nearer (3 vs 27), so without facing it wins; only FACING_BIAS lets facing
  // "down" pick r_fry_1.
  const chop1 = station("r_chop_1");
  const boardGap = { x: RESTAURANT.x + local(chop1).x, y: RESTAURANT.y + rectOf(chop1).bottom + 3 };
  expect(findNearestStationDef(boardGap)?.id).toBe("r_chop_1");
  expect(findNearestStationDef(boardGap, "up")?.id).toBe("r_chop_1");
  expect(findNearestStationDef(boardGap, "down")?.id).toBe("r_fry_1");

  // The 8px gap between the shrimp and egg crates on the top row: standing 1px closer to the shrimp,
  // facing "left" picks it while facing "right" picks the egg.
  const shrimp = station("r_crate_shrimp");
  const crateGap = { x: RESTAURANT.x + rectOf(shrimp).right + 1, y: RESTAURANT.y + local(shrimp).y };
  expect(findNearestStationDef(crateGap, "left")?.id).toBe("r_crate_shrimp");
  expect(findNearestStationDef(crateGap, "right")?.id).toBe("r_crate_egg");
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

test("edge-layout T3: two players collaborate through the open middle - potato: chop, hand over, boil, plate", async ({
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
      () => (window as unknown as { __GAME__?: { state?: { phase?: string } } }).__GAME__?.state?.phase === "playing",
    );

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

    // Stand spots sit 18-36px off each station's edge (INTERACT_RANGE is 70); every walk crosses the
    // open middle, which has no stations at all.
    const potatoCrate = station("r_crate_potato");
    const chop1 = station("r_chop_1");
    const counter1 = station("r_counter_1");
    const boil1 = station("r_boil_1");
    const plateShelf = station("r_shelf_plate");
    const spawn = local(RESTAURANT_SPAWN_POINTS[0]);
    const potatoStand: [number, number] = [local(potatoCrate).x, rectOf(potatoCrate).bottom + 36];
    const chopStand: [number, number] = [rectOf(chop1).right + 18, local(chop1).y];
    const counterStand: [number, number] = [local(counter1).x, rectOf(counter1).top - 26];
    const boilStand: [number, number] = [rectOf(boil1).right + 18, local(boil1).y];
    const plateStand: [number, number] = [local(plateShelf).x, rectOf(plateShelf).top - 25];

    // Player 1: potato from the top crate row -> chop on r_chop_1 (left column) -> r_counter_1.
    await walkRestaurantPath(page1, [[potatoStand[0], spawn.y], potatoStand], "up");
    await interact(page1);
    await expect.poll(() => heldOf(page1)).toBe("food:potato");

    await walkRestaurantPath(page1, [chopStand], "left");
    await interact(page1);
    await expect.poll(() => stationItemOf(page1, "r_chop_1")).toBe("food:potato.chop");
    await interact(page1);
    await expect.poll(() => heldOf(page1)).toBe("food:potato.chop");

    await walkRestaurantPath(page1, [counterStand], "down");
    await interact(page1);
    await expect.poll(() => stationItemOf(page1, "r_counter_1")).toBe("food:potato.chop");
    await expect.poll(() => heldOf(page1)).toBe("");

    await walkRestaurantPath(page1, [[spawn.x, spawn.y]], "up");

    // Player 2: take it from r_counter_1 -> boil at r_boil_1 -> scoop onto a plate from r_shelf_plate.
    await walkRestaurantPath(page2, [counterStand], "down");
    await interact(page2);
    await expect.poll(() => heldOf(page2)).toBe("food:potato.chop");

    await walkRestaurantPath(page2, [boilStand], "left");
    await interact(page2);
    await expect.poll(() => heldOf(page2)).toBe("");

    // While the pot works (5s), grab a plate from the bottom row and come back before it burns.
    await walkRestaurantPath(page2, [plateStand], "down");
    await interact(page2);
    await expect.poll(() => heldOf(page2)).toBe("plate");

    await expect.poll(() => stationItemOf(page2, "r_boil_1")).toBe("food:potato.chop.boil");
    await walkRestaurantPath(page2, [boilStand], "left");
    await interact(page2);
    await expect.poll(() => heldOf(page2)).toBe("plate:potato.chop.boil");
  } finally {
    await ctx1.close();
    await ctx2.close();
  }
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

    // Both players stand below the crate row, exactly between the egg and potato crates (~36px from
    // each): only the facing direction tells the two picks apart. The walk stays in the open middle.
    const egg = station("r_crate_egg");
    const potato = station("r_crate_potato");
    const spawn = local(RESTAURANT_SPAWN_POINTS[0]);
    const standX = (local(egg).x + local(potato).x) / 2;
    const standY = rectOf(egg).bottom + 36;
    const crateGapPath: [number, number][] = [
      [standX, spawn.y],
      [standX, standY],
    ];
    await walkRestaurantPath(page1, crateGapPath, "left");
    await interact(page1);
    await expect.poll(() => heldOf(page1)).toBe("food:egg");

    await walkRestaurantPath(page2, crateGapPath, "right");
    await interact(page2);
    await expect.poll(() => heldOf(page2)).toBe("food:potato");
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
