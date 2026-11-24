# AGENTS.md

Guidelines for coding agents working in this repo.

## Project Overview

- 2-player online co-op boba tea shop game ("Tiệm Trà Be Ngọc Giang"). Players pick a username, join a room (max 2), and run timed shifts together: brewing drinks at stations, passing cups over shared counters, serving customers; shift earnings are split between both players.
- npm workspaces monorepo, Node >= 20:
  - `client/` — Vite + TypeScript + Phaser 3.90 (fixed 960x600 world, DOM overlay UI).
  - `server/` — Node + TypeScript + Colyseus 0.18 + Express.
  - `shared/` (`@boba/shared`) — constants, menu, interaction rules, Colyseus schema used by both sides.

## Architecture

- Transport: Colyseus WebSocket rooms (client uses `@colyseus/sdk`). HTTP endpoints on the same server: `GET /rooms` (lobby room list, CORS), `GET /health`, admin API under `/admin/users/...` (enabled only when `ADMIN_TOKEN` is set). In production the server also serves `client/dist` from the same origin.
- Ports: server 2567 (`SERVER_PORT` in `shared/src/index.ts`, override with `PORT`); client dev 5173 (`VITE_SERVER_URL` points the client at another server).
- Server-held state:
  - `BobaShopRoom` (`server/src/rooms/BobaShopRoom.ts`): Colyseus schema state — players (position, direction, held item, wallet mirror, host flag, bed), stations, decorations, orders, shift phase/hostName — plus room-internal maps (move budgets, delivery timers, seat cooldowns). Max 2 players, 2-minute reconnect grace.
  - `SharedShop` (`server/src/shop/SharedShop.ts`): per-username shop (money + furniture), one instance per username cached in a server-wide map (`openShop`/`shopOf`); persisted via `ShopStore` (Upstash Redis when env vars are set, else JSON files in `server/data/`).
- Client → server messages (`Messages` in `shared/src/index.ts`): `position` (every 50 ms), `interact`, `buy_decoration`, `move_decoration`, `sell_decoration`, `start_shift`, `use_door`, `build_tiles`, `move_tile`, `sell_tile`, `leave_bed`. The server validates actions with the same `planInteraction` rules the client uses for previews (`shared/src/interaction.ts`), then updates the schema, which syncs to all clients.

## Codebase Map

- `client/src/main.ts` — entry: username/lobby UI, join/create room, boots Phaser with `ShopScene`, wires DOM panels and events.
- `client/src/scenes/ShopScene.ts` — main scene: game loop, input handling, sends `Messages.*`, renders world.
- `client/src/scenes/` — sub-controllers/views: `CustomerController`, `DecorController`, `BuildController`, `RestaurantView`, `YardView`, `CupView`, art modules.
- `client/src/ui/` — DOM panels: `OrdersPanel`, `DecorPanel`, `BuildPanel`, `ShiftOverlay`, `RecipeGuide`, `rotateUi` (shared ⟳ Xoay button + ⟳ badge used by both the decorate and build panels).
- `client/src/input/` — `KeyboardState` (WASD/arrows + Space), `TouchControls` (joystick + action button).
- `client/src/forceLandscape.ts` — forces landscape on phones (orientation lock or CSS rotation).
- `client/assets-src/` — source art sheets and the art tools in `tools/` (`cut_food.py`, `cut_bathroom.py` — cuts both `bathroom-sheet-1.png` and `bathroom-sheet-2.png`, one background + cut list per sheet — `draw_bathroom_props.py`, `draw_gadget_props.py` — head-on phone/tablet/TV stand/piano sprites).
- `server/src/index.ts` — Colyseus + Express setup: room registry, `/rooms`, `/health`, admin API, static client.
- `server/src/rooms/BobaShopRoom.ts` — room logic: message handlers, shifts, customers, orders, earnings split.
- `server/src/shop/SharedShop.ts` — shared per-username shop state; `server/src/persistence/ShopStore.ts` — users/shops persistence.
- `shared/src/` — `index.ts` (constants, `Messages`), `schema.ts` (Colyseus schema), `interaction.ts` (action rules), `menu.ts`, `venues.ts`, `restaurant.ts`, `decor.ts`, `seating.ts`, `placement.ts`, `characters.ts`, `world.ts`, `lobby.ts`.

Main flow: `client/src/main.ts` (join) → `ShopScene` loop → `room.send(Messages.*)` → `BobaShopRoom` handler → validated via `shared/src/interaction.ts` → schema update broadcast → client scene/panels re-render.

## Commands

```bash
npm install          # install all workspaces
npm run dev          # server (2567) + client (5173) via concurrently
npm run dev:server   # server only
npm run dev:client   # client only
npm run typecheck    # tsc --noEmit: server, then client (no separate script for shared; it is checked via those imports)
npm run build        # build client (tsc --noEmit + vite build)
npm start            # start the server only (serves client/dist if built)
npx playwright test  # e2e tests; config starts dev:server (waits for /health) then dev:client, reusing running ones
```

`npm run serve` = build + start single-origin production server on 2567. Deployment: `render.yaml` (Render blueprint).

## Code Conventions

- TypeScript strict, ES2022, ESM (`"type": "module"`); double quotes, semicolons, 2-space indent; comments in English, player-facing UI text in Vietnamese.
- Game rules and constants live in `shared/` so server and client agree: the server applies them, the client previews them. Do not duplicate constants in client/server.
- Build mode and decorate mode must behave the same way: the same gestures to select, move, rotate (R and the ⟳ button, ⟳ badge), sell (🗑, Delete) and deselect (Esc, clicking an empty cell), and no tool is picked by default. Changing one side requires changing the other, or recording the reason in the task file. Exception: pieces that don't map to one yard cell (rugs, wall art, tabletop gadgets) are decorate-only — `BUILD_TILES` only takes catalog pieces with `layer === "object"`.
- Tabletop gadgets (`layer: "tabletop"`, e.g. phone/tablet) must fit entirely on a piece with `surface` (tables, TV stand, piano vanity). They move and sell with that piece; turning a surface that still carries gadgets is refused ("Dọn đồ trên bàn trước khi xoay"). The link is geometric (`surfaceUnder` / `piecesOnSurface` in `shared/src/placement.ts`), not a schema field.
- Never trust the client: validate moves/interactions server-side (`planInteraction`, move budgets in `BobaShopRoom`).
- Per-username persistent state goes through `SharedShop`; live room state stays in the Colyseus schema (`shared/src/schema.ts`).

## Testing Rules

- After each coding step, run `npm run typecheck` and `npx playwright test`. While `tests/` has no specs, Playwright exits non-zero with "No tests found"; that is expected, so rely on typecheck only and note it in the task file.
- When tests fail, read `test-results/results.json` first (the JSON reporter writes it).
- In "Test status", report every test case from the task file (T1, T2...) as PASS / FAIL / not written yet, not just an overall result.
- When a plan step writes a spec, tick the matching test case in "Test cases" once the spec exists.
- Only use `playwright-cli` (interactive browser tool, separate from `@playwright/test`) when the failure is visual and `results.json` is not enough, or during the Verify phase.
- After any browser testing, clean up: close the browser, delete `.playwright-mcp/` if present, and stop any dev server you started.
- 2-player tests: use two separate browser contexts inside the same test; keep `workers: 1` (the config is already sequential).
- Use unique usernames per test run (e.g. `p1-${Date.now()}`), because shops are persisted per username in `server/data/`.
- Tests must not depend on or modify production data. Locally there are no Upstash env vars, so persistence goes to JSON files in `server/data/`.
- Use `window.__GAME__` to set up state once it exists (TODO: not exposed yet — until then, don't script real gameplay to reach a screen).

## Verify Phase

- After all plan steps are done, a Verify agent checks the feature in a real browser with `playwright-cli` (open `http://localhost:5173/?test=1`, two sessions for 2-player features).
- It checks every item in "Mục tiêu" and "Test cases", records results in the task file's "## Verify" section with screenshot paths, and turns every checked scenario (PASS or FAIL) into a spec in `tests/`.
- The Verify agent must not change game code. Its last line in "## Verify" is exactly `VERIFY: PASS` or `VERIFY: FAIL`.

## Workflow Rules

- Every task has a file in `.agents/tasks/` (template: `_TEMPLATE.md`). Read it before starting work.
- Only modify files named in the task's plan. If another file must change, record the reason in the task file.
- Commit after each step with a clear message.
- Before finishing: tick the plan checkboxes and update "Trạng thái hiện tại" and "Test status" in the task file.

## Documentation Rules

After finishing anything new (feature, gameplay or behavior change, control, protocol/message, env var, script, folder or dependency change), double-check the docs and update whatever is now out of date, in the same task:
- `README.md`: Run, Gameplay, Controls, Mobile, Play online, Dev options, Decorating & saving. Compare it against the code, not against memory.
- `AGENTS.md`: Architecture, Codebase Map, Commands, Code Conventions.
- Remove statements that are no longer true instead of adding a note next to them.
- If nothing needs changing, say so in the task file's "Trạng thái hiện tại" (e.g. "Docs checked: no change needed").

