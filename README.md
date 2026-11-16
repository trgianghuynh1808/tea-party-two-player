# Tiệm Trà Bé Ngọc Giang

2-player online co-op boba tea shop game (npm workspaces monorepo).

- `server/` — Node.js + TypeScript + Colyseus 0.18 (`BobaShopRoom`: 2 players per room; `SharedShop`: money + furniture shared by all rooms)
- `client/` — Vite + TypeScript + Phaser 3.90 (placeholder shapes, no assets yet)
- `shared/` — constants, station layout, movement code and Colyseus Schema used by both sides

## Run

```bash
npm install
npm run dev   # server: ws://localhost:2567, client: http://localhost:5173
```

Open http://localhost:5173:

1. Pick a username (no password; remembered by the browser).
2. The lobby lists open rooms (title, who's inside, players/2). Click **Vào** to join one, or **Tạo phòng** to open a new one.
3. In a room, **🔗 Mời** copies an invite link (`?room=<id>`) that opens that room directly.

Rooms & usernames (`shared/src/lobby.ts`, `server/src/rooms/BobaShopRoom.ts`):

- A room holds at most 2 players. Every room plays in the same shop (money + furniture).
- A name can only be used by one connected player. The same name from the same browser replaces a stale tab
  (closed but not detected yet, or open twice); from another browser it is refused while its owner is online.
- Lost connection (closed tab, network): the player stays in the room (shown 💤) for 2 minutes
  (`RECONNECT_GRACE_SECONDS`). Coming back with the same name (**Vào lại** in the lobby, or refreshing the page)
  takes over the same character, position and held cup.
- A room with nobody left (after the 2 minutes for dropped players) is removed.
To play from another machine on the same LAN, open the **Network** URL printed by Vite (e.g. `http://192.168.x.x:5173`).

## Gameplay

- The shop starts closed: walk around and practice, then press **Bắt đầu ca** to open a 3-minute shift.
- At the end of the shift you get 1–3 stars based on shift earnings ($100 / $220 / $350), plus served/missed stats. Total shop money carries over between shifts.
- The counters (**Bàn**) in the middle hold one cup each: put a cup down / pick it up with Space to pass it to your teammate.
- Customers order drinks (see the **Đơn hàng** panel). Each order has a timer; serve it before it runs out.
- Every drink has its own recipe (ordered steps), shown in the **Menu** panel.
- Each machine adds one ingredient. Machines marked ⏱ take time: put the cup down, wait for "Xong!", press Space again to pick it up.
- Machines refuse steps that don't lead to any drink on the menu. Throw a cup in the trash bin to start over.
- Delivering pays the drink price, plus a $5 tip per drink if served with more than half of the time left.
- Difficulty ramps up during a shift: customers come every 9s → 5s and wait 60s → 35s.
- A customer walking out costs $10 and resets the combo. Completing 3+ orders in a row gives +20%, 6+ gives +50% (🔥 combo in the HUD).
- Special customers: 👑 VIP (double price, waits only 25s), 🧐 picky (+$10 if fast, half price if slow), 👨‍👩‍👧 group (2–3 drinks, pays once all are delivered).
- A finished cup left on a timed machine spills after 6s (the bar turns red, "Sắp tràn!").

Add or change drinks, ingredients, machines, shift length and star thresholds in `shared/src/menu.ts`.
Interaction rules live in `shared/src/interaction.ts` (`planInteraction`), used by the server to apply actions and by the client to preview them.

## Mobile

Play in landscape. The game area scales to fit the screen; on small screens the side panel only shows orders,
and 📋 Menu / 🛒 Shop open as pop-ups. Holding the phone in portrait shows a "rotate your phone" hint.
On Android, ⛶ Full switches to fullscreen and locks landscape (iPhone Safari has no Fullscreen API).

To test on a phone, open the Vite **Network** URL (e.g. `http://192.168.x.x:5173`) on the same Wi-Fi.

## Play online with a friend (free)

`npm run serve` builds the client and starts the game server on port 2567, serving the game and the
WebSocket from the same origin. Then either:

- **Cloudflare Quick Tunnel** (no account, your computer must stay on):
  `brew install cloudflared` then `cloudflared tunnel --url http://localhost:2567` → share the printed
  `https://….trycloudflare.com` URL. The URL changes every time you restart the tunnel.
- **Render free web service** (permanent URL, no computer needed): push the repo to GitHub, then in Render
  choose *New → Blueprint* and select the repo (uses `render.yaml`). Free instances sleep after 15 minutes
  without traffic; the first visit afterwards takes about a minute.

## Dev options

- `SHIFT_SECONDS=20 npm run dev` — shorter shifts for testing (server only).
- `VITE_SERVER_URL=http://host:2567` — point the client at another game server.

## Decorating & saving

- Press **🪑 Trang trí** between shifts (not during a shift) to enter decorate mode.
- Drag furniture from the side panel into the shop to buy it; drag placed furniture to move it, or drop it on
  **🗑** to sell it back for 50%. Red outline = can't place there (machines, counters, other furniture).
  Rugs lie on the floor, so furniture can go on top of them.
- Everyone shares one shop, across all rooms (`server/src/shop/SharedShop.ts`): furniture bought in one room shows
  up right away in the others. Money + furniture are saved (debounced ~1 s after each change, and when a room
  closes) and restored when the server starts its first room. (Kept in memory: assumes one server process.)
- Where saves go:
  - **Upstash Redis** when `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set. Use this in the
    cloud: Render free wipes its disk on every restart, sleep and deploy.
  - Otherwise JSON files in `server/data/shops/` (`DATA_DIR` env to change the folder) — fine locally.
  - The server logs which one it uses at startup (`Saving shops to …`).
- If the save can't be read (storage down), rooms can't be opened ("Không tải được quán") until it can, so an
  empty shop never overwrites the real save.
- Catalog and placement rules: `shared/src/decor.ts`.

### Setting up Upstash (free)

1. Create a free account at upstash.com → **Create Database** (Redis, pick a region near the Render server,
   e.g. US West for Oregon).
2. In the database page, open the **REST API** section and copy `UPSTASH_REDIS_REST_URL` and
   `UPSTASH_REDIS_REST_TOKEN`.
3. Render dashboard → your service → **Environment** → add both variables → save (the service redeploys).
4. Check the Render logs for `Saving shops to Upstash Redis`.

## Controls

- WASD / arrow keys: move
- Space: interact with the nearest station (highlighted). The hint at the bottom right shows what Space will do.
- Touch devices: touch anywhere on the left half for a floating joystick (8 directions); the round button on the right is the action button and shows what it will do. Add `?touch=1` to the URL to force touch controls on desktop.
