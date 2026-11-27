import { expect, test, type Page } from "@playwright/test";
import {
  DOCK,
  FISH,
  FISH_COUNT,
  HOOK_SPEED,
  PLAYER_RADIUS,
  POND,
  POND_DOOR_X,
  POND_ENTER_ZONE,
  POND_ENTRY_SPAWN,
  POND_EXIT_ZONE,
  RODS,
  WATER,
  YARD,
  getFish,
} from "@boba/shared";
import { joinAsHost } from "./helpers";
import { TEST_SERVER_URL } from "./ports";

/**
 * Fishing pond e2e (task .agents/tasks/2026-11-26-task-19-...):
 * - T1 walks through the pond gate's doormat and back out through the dock mat.
 * - T2 lands a fish: cast, bite, hold the reel until it is sold into the catcher's own wallet.
 * - T3 runs a whole (20s, FISH_SECONDS) session to the summary and buys the next rod with money.
 * The server runs with FISH_SECONDS=20 FISH_TEST=1 DEBUG_WARP=1 (playwright.config.ts): every fish is
 * a Cá rô that always bites, and `debug_warp` can put the player on the pond's doormat.
 */

const ADMIN_TOKEN = "test-admin-token";

let userSeq = 0;
/** Unique per test run: shops persist per username in server/data/. Base36 keeps it within USERNAME_MAX. */
const uniqueUser = () => `p1-${Date.now().toString(36)}-${userSeq++}`;

type PlayerSnap = {
  x: number;
  y: number;
  money: number;
  rodLevel: number;
  hookState: string;
  reelProgress: number;
  fishCaught: number;
  fishEarned: number;
  lastCatch: string;
};
type FishSnap = { id: string; species: string; x: number; y: number; dir: number };
type Snap = { fishPhase: string; fishTimeLeft: number; fishSize: number; fish: FishSnap[]; me: PlayerSnap };

/** Read the local player + the pond from the live room state through the test hook. */
const snap = (page: Page): Promise<Snap> =>
  page.evaluate(() => {
    type P = PlayerSnap;
    type F = FishSnap;
    const g = (
      window as unknown as {
        __GAME__: {
          room: { sessionId: string };
          state: {
            fishPhase: string;
            fishTimeLeft: number;
            fish: { size: number; forEach(cb: (f: F) => void): void };
            players: { get(id: string): P };
          };
        };
      }
    ).__GAME__;
    const me = g.state.players.get(g.room.sessionId);
    const fish: F[] = [];
    g.state.fish.forEach((f) => fish.push({ id: f.id, species: f.species, x: f.x, y: f.y, dir: f.dir }));
    return {
      fishPhase: g.state.fishPhase,
      fishTimeLeft: g.state.fishTimeLeft,
      fishSize: g.state.fish.size,
      fish,
      me: {
        x: me.x,
        y: me.y,
        money: me.money,
        rodLevel: me.rodLevel,
        hookState: me.hookState,
        reelProgress: me.reelProgress,
        fishCaught: me.fishCaught,
        fishEarned: me.fishEarned,
        lastCatch: me.lastCatch,
      },
    };
  });

/** Send a client -> server message through the test hook. */
const send = (page: Page, type: string, payload?: unknown) =>
  page.evaluate(
    ({ type, payload }) =>
      (window as unknown as { __GAME__: { send(t: string, p?: unknown): void } }).__GAME__.send(type, payload),
    { type, payload },
  );

/** Test-only teleport (server env DEBUG_WARP=1). */
const warp = (page: Page, x: number, y: number) => send(page, "debug_warp", { x, y });

/** The local player's rod sprite at the pond (must be idle before casting). */
const pondRod = (page: Page): Promise<{ visible: boolean; lineColor: number } | null> =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __GAME__: { pondRod(): { visible: boolean; lineColor: number } | null };
        }
      ).__GAME__.pondRod(),
  );

/** What the pond view drew this frame: the local hook, the fish and the running bite-effect count. */
const pondRender = (page: Page): Promise<{ hookY: number | null; fish: { id: string; x: number }[]; biteFx: number } | null> =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __GAME__: {
            pondRender(): { hookY: number | null; fish: { id: string; x: number }[]; biteFx: number } | null;
          };
        }
      ).__GAME__.pondRender(),
  );

const enterPond = async (page: Page): Promise<void> => {
  await warp(page, POND_DOOR_X, (POND_ENTER_ZONE.top + POND_ENTER_ZONE.bottom) / 2);
  await expect.poll(async () => (await snap(page)).me.x, { timeout: 10_000 }).toBeGreaterThanOrEqual(POND.x);
};

const exitPond = async (page: Page): Promise<void> =>
  warp(page, (POND_EXIT_ZONE.left + POND_EXIT_ZONE.right) / 2, (POND_EXIT_ZONE.top + POND_EXIT_ZONE.bottom) / 2);

/** The x a cast should drop at so its straight fall meets a fish (see the hook drop in BobaShopRoom). */
const HOOK_SAFE_LEFT = DOCK.left + PLAYER_RADIUS + 2;
const HOOK_SAFE_RIGHT = DOCK.right - PLAYER_RADIUS - 2;
/** On the dock, above the water but clear of the exit mat (its top edge is y=110). */
const DOCK_CAST_Y = DOCK.top + 20;

/**
 * Pick the easiest fish to intercept: the one whose lane the hook reaches soonest, aimed at where that
 * fish will be by then (the species' swim speed is shared data, the hook falls at HOOK_SPEED).
 */
function aimAt(fish: FishSnap[]): number | undefined {
  const aimed = fish
    .map((f) => {
      const speed = getFish(f.species)?.speed ?? 40;
      const fall = Math.max(0, (f.y - WATER.top) / HOOK_SPEED);
      return { fall, x: f.x + f.dir * speed * fall };
    })
    .filter((o) => o.x >= HOOK_SAFE_LEFT && o.x <= HOOK_SAFE_RIGHT)
    .sort((a, b) => a.fall - b.fall);
  if (aimed[0]) return aimed[0].x;

  // Every fish is near a bank: aim at the closest reachable spot and let the loop try again.
  const any = fish.map((f) => {
    const speed = getFish(f.species)?.speed ?? 40;
    const fall = Math.max(0, (f.y - WATER.top) / HOOK_SPEED);
    const x = f.x + f.dir * speed * fall;
    return Math.min(HOOK_SAFE_RIGHT, Math.max(HOOK_SAFE_LEFT, x));
  });
  return any[0];
}

/** Cast again and again (aiming at a fish) until one takes the hook; a missed hook reels itself in. */
async function castUntilBite(page: Page, deadlineMs = 40_000): Promise<void> {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    const state = await snap(page);
    if (state.me.hookState === "reel") return;
    if (state.me.hookState === "") {
      const targetX = aimAt(state.fish);
      if (targetX !== undefined) await warp(page, targetX, DOCK_CAST_Y);
      await send(page, "cast");
    }
    await page.waitForTimeout(120);
  }
}

test("T1: the pond gate's doormat takes the player into the pond, the dock mat takes them back to the yard", async ({
  page,
}) => {
  await joinAsHost(page, uniqueUser());
  await enterPond(page);

  await expect.poll(async () => (await snap(page)).me.x).toBe(POND_ENTRY_SPAWN.x);
  await expect.poll(async () => (await snap(page)).me.y).toBe(POND_ENTRY_SPAWN.y);
  await expect(page.locator("#fishing-start")).toBeVisible();

  await exitPond(page);
  await expect.poll(async () => (await snap(page)).me.y).toBeGreaterThanOrEqual(YARD.y);
  await expect(page.locator("#fishing-start")).toBeHidden();
});

test("T1: the Câu cá card in the shift picker warps the player to the pond and starts a session", async ({
  page,
}) => {
  await joinAsHost(page, uniqueUser());
  const before = await snap(page);
  expect(before.fishPhase).not.toBe("fishing");
  expect(before.me.x).toBeLessThan(POND.x);

  await expect(page.locator("#shift-overlay")).toBeVisible();
  await expect(page.locator("#shift-fish-pick")).toBeVisible();
  await page.locator("#shift-fish-pick").click();

  await expect.poll(async () => (await snap(page)).fishPhase, { timeout: 10_000 }).toBe("fishing");
  const after = await snap(page);
  expect(after.fish.length).toBe(FISH_COUNT);
  expect(Math.abs(after.me.x - POND_ENTRY_SPAWN.x)).toBeLessThanOrEqual(40);
  expect(Math.abs(after.me.y - POND_ENTRY_SPAWN.y)).toBeLessThanOrEqual(40);
  await expect(page.locator("#shift-overlay")).toBeHidden();
});

test("T2: cast, bite, hold the reel -> one Cá rô sold into the catcher's wallet", async ({ page }) => {
  test.setTimeout(90_000);
  await joinAsHost(page, uniqueUser());
  await enterPond(page);

  await send(page, "start_fishing");
  await expect.poll(async () => (await snap(page)).fishPhase).toBe("fishing");
  await expect.poll(async () => (await snap(page)).fishSize).toBe(FISH_COUNT);

  // Cast again and again (aiming at a fish) until one takes the hook; a missed hook reels itself in.
  const deadline = Date.now() + 40_000;
  while (Date.now() < deadline) {
    const state = await snap(page);
    if (state.me.hookState === "reel") break;
    if (state.me.hookState === "") {
      const targetX = aimAt(state.fish);
      if (targetX !== undefined) await warp(page, targetX, DOCK_CAST_Y);
      await send(page, "cast");
    }
    await page.waitForTimeout(120);
  }

  await expect.poll(async () => (await snap(page)).me.hookState, { timeout: 10_000 }).toBe("reel");
  await expect(page.locator("#fishing-reel")).toBeVisible();

  await send(page, "reel", { holding: true });
  await expect.poll(async () => (await snap(page)).me.fishCaught, { timeout: 20_000 }).toBe(1);
  await send(page, "reel", { holding: false });

  const after = await snap(page);
  expect(after.me.money).toBe(8);
  expect(after.me.fishEarned).toBe(8);
  expect(after.me.hookState).toBe("");
  await expect(page.locator("#fishing-toast")).toContainText("Cá rô");
});

test("T3: the 20s session ends with a summary, and money buys the next rod", async ({ page, request }) => {
  test.setTimeout(90_000);
  const user = uniqueUser();
  // Fund the shop before the room opens it (the same shop-restore endpoint the admin portal uses).
  const put = await request.put(`${TEST_SERVER_URL}/admin/users/${encodeURIComponent(user)}/shop`, {
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    data: { money: 500, decorations: [] },
  });
  expect(put.status()).toBe(200);

  await joinAsHost(page, user);
  await enterPond(page);
  await expect.poll(async () => (await snap(page)).me.money).toBe(500);

  await send(page, "start_fishing");
  await expect.poll(async () => (await snap(page)).fishPhase, { timeout: 40_000 }).toBe("ended");

  const summary = page.locator("#fishing-summary");
  await expect(summary).toBeVisible();
  await expect(summary).toContainText("0 con");
  await expect(summary).toContainText("$0");

  await send(page, "upgrade_rod");
  await expect.poll(async () => (await snap(page)).me.rodLevel).toBe(2);
  await expect.poll(async () => (await snap(page)).me.money).toBe(200);

  const upgrade = page.locator("#fishing-upgrade");
  await expect(upgrade).toContainText("Cần carbon");
  await expect(upgrade).toContainText("$900");
  await expect(upgrade).toBeDisabled();
});

test("T4: the sidebar fish/rod guide only lives at the pond, replacing the orders panel", async ({ page }) => {
  await joinAsHost(page, uniqueUser());

  const guide = page.locator("#fish-guide");
  const orders = page.locator("#orders-panel");

  // 1. In the yard: no guide, orders panel as usual.
  await expect(guide).toBeHidden();
  await expect(orders).toBeVisible();

  // 2. At the pond: every fish by tier (above), every rod below, the owned rod highlighted.
  await enterPond(page);
  await expect(guide).toBeVisible();
  await expect(page.locator("#fish-guide [data-fish]")).toHaveCount(FISH.length);
  await expect(page.locator("#fish-guide [data-rod]")).toHaveCount(RODS.length);
  await expect(page.locator('#fish-guide [data-rod="1"]')).toHaveAttribute("data-current", "true");
  const fishBox = await page.locator('[data-testid="fish-guide-fish"]').boundingBox();
  const rodsBox = await page.locator('[data-testid="fish-guide-rods"]').boundingBox();
  expect(fishBox).not.toBeNull();
  expect(rodsBox).not.toBeNull();
  if (fishBox && rodsBox) expect(fishBox.y).toBeLessThan(rodsBox.y);
  await expect(orders).toBeHidden();

  // 3. Back in the yard: the guide hides and the orders panel returns.
  await exitPond(page);
  await expect.poll(async () => (await snap(page)).me.y).toBeGreaterThanOrEqual(YARD.y);
  await expect(guide).toBeHidden();
  await expect(orders).toBeVisible();
});

test("T1: T22 every fish species has a PNG sprite and a FishGuide icon", async ({ page }) => {
  await joinAsHost(page, uniqueUser());

  for (const f of FISH) {
    const res = await page.request.get(new URL(`assets/fish/${f.id}.png`, page.url()).href);
    expect(res.status(), `${f.id} status`).toBe(200);
    expect(res.headers()["content-type"], `${f.id} content-type`).toContain("image/png");
  }

  await send(page, "start_fishing");
  await expect.poll(async () => (await snap(page)).fishPhase, { timeout: 10_000 }).toBe("fishing");

  await expect(page.locator(".fish-guide-row[data-fish]")).toHaveCount(FISH.length);
  await expect(page.locator(".fish-guide-row[data-fish] img.fish-guide-icon")).toHaveCount(FISH.length);
});

test("T2: T22 pond fish use valid species and load without errors", async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await joinAsHost(page, uniqueUser());

  await send(page, "start_fishing");
  await expect.poll(async () => (await snap(page)).fishPhase, { timeout: 10_000 }).toBe("fishing");
  await expect.poll(async () => (await snap(page)).fishSize, { timeout: 10_000 }).toBe(FISH_COUNT);

  const state = await snap(page);
  const ids = FISH.map((f) => f.id);
  expect(state.fish).toHaveLength(FISH_COUNT);
  for (const fish of state.fish) {
    expect(ids, `fish ${fish.id} species ${fish.species}`).toContain(fish.species);
  }

  expect(pageErrors, "pageerror").toEqual([]);
  const bad = consoleErrors.filter((t) => t.includes("Failed to process file") || t.includes("404"));
  expect(bad, "console errors").toEqual([]);
});

test("T1: T23 long fish sprites lie flat (main axis within 12° of horizontal)", async ({ page }) => {
  await page.goto("/?test=1");
  const angles = await page.evaluate(async () => {
    const ids = ["ca_thu", "ca_he", "ca_tram", "ca_tre", "ca_rong", "ca_ro", "ca_loc", "ca_map", "ca_chep", "ca_koi"];
    const out: { id: string; angle: number }[] = [];
    for (const id of ids) {
      const img = new Image();
      img.src = `/assets/fish/${id}.png`;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d context");
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let n = 0;
      let mx = 0;
      let my = 0;
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          if (data[(y * canvas.width + x) * 4 + 3] > 0) {
            n++;
            mx += x;
            my += y;
          }
        }
      }
      mx /= n;
      my /= n;
      let sxx = 0;
      let syy = 0;
      let sxy = 0;
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          if (data[(y * canvas.width + x) * 4 + 3] > 0) {
            const dx = x - mx;
            const dy = y - my;
            sxx += dx * dx;
            syy += dy * dy;
            sxy += dx * dy;
          }
        }
      }
      const angle = (0.5 * Math.atan2(2 * sxy, sxx - syy) * 180) / Math.PI;
      out.push({ id, angle });
    }
    return out;
  });

  const tilted = angles.filter((a) => Math.abs(a.angle) >= 12);
  const detail = tilted.map((a) => `${a.id}=${a.angle.toFixed(1)}°`).join(", ");
  expect(tilted, `fish still tilted (>= 12°): ${detail}`).toEqual([]);
});

test("T4: two players in the pond see the same fish and each other's hook", async ({ browser }) => {
  const hostCtx = await browser.newContext();
  const guestCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();
  try {
    await joinAsHost(host, uniqueUser());
    const roomId = await host.evaluate(
      () => (window as unknown as { __GAME__: { room: { roomId: string } } }).__GAME__.room.roomId,
    );
    await guest.goto(`/?test=1&room=${encodeURIComponent(roomId)}`);
    await guest.locator("#username-input").fill(uniqueUser());
    await guest.locator("#name-form button[type=submit]").click();
    await guest.waitForFunction(() => !!(window as { __GAME__?: unknown }).__GAME__);

    await enterPond(host);
    await enterPond(guest);
    await send(host, "start_fishing");
    await expect.poll(async () => (await snap(guest)).fishPhase, { timeout: 10_000 }).toBe("fishing");

    const h = await snap(host);
    const g = await snap(guest);
    expect(h.fishSize).toBe(10);
    expect(g.fish.map((f) => f.id).sort()).toEqual(h.fish.map((f) => f.id).sort());

    // The guest casts; the host's copy of the state shows the guest's hook.
    await warp(guest, (HOOK_SAFE_LEFT + HOOK_SAFE_RIGHT) / 2, DOCK_CAST_Y);
    await send(guest, "cast");
    const guestId = await guest.evaluate(
      () => (window as unknown as { __GAME__: { room: { sessionId: string } } }).__GAME__.room.sessionId,
    );
    await expect
      .poll(
        () =>
          host.evaluate(
            (id) =>
              (window as unknown as { __GAME__: { state: { players: { get(i: string): { hookState: string } } } } })
                .__GAME__.state.players.get(id)?.hookState,
            guestId,
          ),
        { timeout: 5_000 },
      )
      .not.toBe("");
  } finally {
    await hostCtx.close();
    await guestCtx.close();
  }
});

test("T5: rod sprite shows while the hook is out", async ({ page }) => {
  await joinAsHost(page, `rod1-${Date.now().toString(36)}`);
  await enterPond(page);
  await send(page, "start_fishing");
  await expect.poll(async () => (await snap(page)).fishPhase).toBe("fishing");

  // 1. No rod in hand before casting.
  const before = await pondRod(page);
  expect(before === null || before.visible === false).toBe(true);

  // 2. Cast: the hook falls, so the player holds the rod out.
  await warp(page, (HOOK_SAFE_LEFT + HOOK_SAFE_RIGHT) / 2, DOCK_CAST_Y);
  await send(page, "cast");
  await expect.poll(async () => (await snap(page)).me.hookState, { timeout: 10_000 }).toBe("drop");

  // 3. The rod is visible while the hook is in the water.
  const during = await pondRod(page);
  expect(during?.visible).toBe(true);

  // 4. Retract the hook.
  await send(page, "retract");
  await expect.poll(async () => (await snap(page)).me.hookState, { timeout: 10_000 }).toBe("");

  // 5. The rod is gone once the line is back in.
  const after = await pondRod(page);
  expect(after === null || after.visible === false).toBe(true);
});

test("T6: line color changes after a rod upgrade", async ({ page, request }) => {
  const user = `rod2-${Date.now().toString(36)}`;
  // Fund the shop before the room opens it so the level-2 rod (300) is affordable.
  const put = await request.put(`${TEST_SERVER_URL}/admin/users/${encodeURIComponent(user)}/shop`, {
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    data: { money: 500, decorations: [] },
  });
  expect(put.status()).toBe(200);

  await joinAsHost(page, user);
  await enterPond(page);
  await send(page, "start_fishing");
  await expect.poll(async () => (await snap(page)).fishPhase).toBe("fishing");

  // 1. Level-1 rod: cast and read the line colour.
  await warp(page, (HOOK_SAFE_LEFT + HOOK_SAFE_RIGHT) / 2, DOCK_CAST_Y);
  await send(page, "cast");
  await expect.poll(async () => (await snap(page)).me.hookState, { timeout: 10_000 }).toBe("drop");
  const c1 = (await pondRod(page))?.lineColor;
  expect(c1).toBe(RODS[0].lineColor);

  // 2. Retract, then buy the next rod.
  await send(page, "retract");
  await expect.poll(async () => (await snap(page)).me.hookState, { timeout: 10_000 }).toBe("");
  await send(page, "upgrade_rod");
  await expect.poll(async () => (await snap(page)).me.rodLevel).toBe(2);

  // 3. Cast again: the line now uses the level-2 colour.
  await send(page, "cast");
  await expect.poll(async () => (await snap(page)).me.hookState, { timeout: 10_000 }).toBe("drop");
  const c2 = (await pondRod(page))?.lineColor;
  expect(c2).toBe(RODS[1].lineColor);
  expect(c1).not.toBe(c2);
});

test("T1: T27 the sinking hook moves smoothly every frame (no stalls, no jumps)", async ({ page }) => {
  await joinAsHost(page, uniqueUser());
  await enterPond(page);
  await send(page, "start_fishing");
  await expect.poll(async () => (await snap(page)).fishPhase).toBe("fishing");

  // 1. Cast from the dock: the hook sinks.
  await warp(page, (HOOK_SAFE_LEFT + HOOK_SAFE_RIGHT) / 2, DOCK_CAST_Y);
  await send(page, "cast");
  await expect.poll(async () => (await snap(page)).me.hookState, { timeout: 10_000 }).toBe("drop");

  // 2. Sample the drawn hook y once per frame until 40 samples or the hook stops dropping.
  const samples = await page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        type Render = { hookY: number | null; fish: { id: string; x: number }[] };
        const g = (
          window as unknown as {
            __GAME__: {
              room: { sessionId: string };
              state: { players: { get(id: string): { hookState: string } } };
              pondRender(): Render | null;
            };
          }
        ).__GAME__;
        const out: number[] = [];
        const tick = () => {
          const hookY = g.pondRender()?.hookY;
          if (typeof hookY === "number") out.push(hookY);
          const state = g.state.players.get(g.room.sessionId)?.hookState;
          if (out.length >= 40 || state !== "drop") return resolve(out);
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );

  // 3. The hook is drawn moving on almost every frame and never teleports between frames.
  expect(samples.length).toBeGreaterThanOrEqual(20);
  let still = 0;
  let maxJump = 0;
  for (let i = 1; i < samples.length; i++) {
    const jump = Math.abs(samples[i] - samples[i - 1]);
    if (jump === 0) still++;
    if (jump > maxJump) maxJump = jump;
  }
  expect(still, `frames where the hook did not move (${still}/${samples.length})`).toBeLessThanOrEqual(samples.length * 0.1);
  expect(maxJump, "biggest hook move between two frames").toBeLessThanOrEqual(6);
});

test("T1: T28 a bite spawns the ripple effect and shows the Cá cắn câu toast", async ({ page }) => {
  test.setTimeout(90_000);
  await joinAsHost(page, uniqueUser());
  await enterPond(page);
  await send(page, "start_fishing");
  await expect.poll(async () => (await snap(page)).fishPhase, { timeout: 10_000 }).toBe("fishing");

  // 1. No bite effect yet.
  const b0 = (await pondRender(page))?.biteFx ?? 0;
  expect(b0).toBe(0);

  // 2. Cast until a fish takes the hook.
  await castUntilBite(page);
  await expect.poll(async () => (await snap(page)).me.hookState, { timeout: 10_000 }).toBe("reel");

  // 3. The pond view spawned a ripple and the panel toasted the bite.
  await expect
    .poll(async () => (await pondRender(page))?.biteFx ?? 0, { timeout: 10_000 })
    .toBeGreaterThanOrEqual(b0 + 1);
  await expect(page.locator("#fishing-toast")).toContainText("Cá cắn câu");
});

test("T2: T28 the session summary shows each player's biggest catch", async ({ page }) => {
  test.setTimeout(90_000);
  await joinAsHost(page, uniqueUser());
  await enterPond(page);
  await send(page, "start_fishing");
  await expect.poll(async () => (await snap(page)).fishPhase, { timeout: 10_000 }).toBe("fishing");

  // 1. Land one Cá rô early in the 20s session.
  await castUntilBite(page);
  await send(page, "reel", { holding: true });
  await expect.poll(async () => (await snap(page)).me.fishCaught, { timeout: 20_000 }).toBe(1);
  await send(page, "reel", { holding: false });

  // 2. Let the session end, then read the summary.
  await expect.poll(async () => (await snap(page)).fishPhase, { timeout: 40_000 }).toBe("ended");
  const summary = page.locator("#fishing-summary");
  await expect(summary).toBeVisible();
  await expect(summary).toContainText("Cá to nhất");
  await expect(summary).toContainText("Cá rô");
});
