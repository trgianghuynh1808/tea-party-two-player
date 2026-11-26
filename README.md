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

- A room holds at most 2 players. Each username has its own shop save (wallet + furniture). A room shows the
  furniture of whoever opened it (the host); only the host can decorate it, paid from the host's wallet.
- A name can only be used by one connected player. The same name from the same browser replaces a stale tab
  (closed but not detected yet, or open twice); from another browser it is refused while its owner is online.
- Lost connection (closed tab, network): the player stays in the room (shown 💤) for 2 minutes
  (`RECONNECT_GRACE_SECONDS`). Coming back with the same name (**Vào lại** in the lobby, or refreshing the page)
  takes over the same character, position and held cup.
- A room with nobody left (after the 2 minutes for dropped players) is removed.
To play from another machine on the same LAN, open the **Network** URL printed by Vite (e.g. `http://192.168.x.x:5173`).

## Gameplay

- The shop starts closed: walk around and practice, then press **Bắt đầu ca** to open a 3-minute shift.
- At the end of the shift you get 1–3 stars based on shift earnings ($100 / $220 / $350), plus served/missed stats. The shift's earnings (minus penalties) are split equally between the players in the room
  and added to each player's wallet; leftover dollars go one each to the first players, and no wallet goes below $0.
  Leaving mid-shift forfeits your share. Wallets carry over between shifts and rooms.
- The counters (**Bàn**) in the middle hold one cup each: put a cup down / pick it up with Space to pass it to your teammate.
- Customers order drinks (see the **Đơn hàng** panel). Each order has a timer; serve it before it runs out.
- Every drink has its own recipe (ordered steps), shown on its order card; the **?** next to it opens a step-by-step
  cooking guide (`client/src/ui/RecipeGuide.ts`).
- Each machine adds one ingredient. Machines marked ⏱ take time: put the cup down, wait for "Xong!", press Space again to pick it up.
- Machines refuse steps that don't lead to any drink on the menu. Throw a cup in the trash bin to start over.
- Delivering pays the drink price, plus a $5 tip per drink if served with more than half of the time left.
- Difficulty ramps up during a shift: customers come every 9s → 5s and wait 60s → 35s.
- A customer walking out costs $10 and resets the combo. Completing 3+ orders in a row gives +20%, 6+ gives +50% (🔥 combo in the HUD).
- Special customers: 👑 VIP (double price, waits only 25s), 🧐 picky (+$10 if fast, half price if slow), 👨‍👩‍👧 group (2–3 drinks, pays once all are delivered).
- A finished cup left on a timed machine spills after 6s (the bar turns red, "Sắp tràn!").
- Beds (furniture with `role: "bed"` in `shared/src/decor.ts`): stand next to one with empty hands and press Space to
  lie down (head on the pillow, 💤). Works for beds in the shop and beds built in the yard. Space or walking gets
  you up in front of it. One player per bed; starting a shift, selling / erasing or moving the bed gets the sleeper
  up / moves them with it (`BedSpot`, `bedSpots`, `findBedSpot` in `shared/src/index.ts`).

Add or change drinks, ingredients and machines in `shared/src/menu.ts`; shift length, pace and star thresholds per venue in `shared/src/venues.ts`.

### Restaurant

- Outside, walk left from the tea shop to the restaurant (🍽️); its doormat leads into a bigger, scrolling kitchen + dining room.
- The shift card offers two start buttons: **Tiệm trà** or **Nhà hàng** (the place you're standing in is first). The shift's
  customers come to that venue only; combo, special customers, tips and the split work the same.
- Kitchen: crates hand out raw ingredients; cookers process one ingredient each (🔪 board, 🍳 pan, 🍲 pot, 🔥 grill,
  🍟 fryer, 🌀 blender, ☕ coffee machine). Hot cookers burn food left too long (it must go in the trash).
- Shelves hand out plates, bowls and glasses. Plating goes one way only: take the container to the food (a cooker with
  finished food, a counter, or the crate of a part used raw) and press to scoop it in, in any order. Food can't be
  carried to a container. A container matching a dish exactly is served at the table or the take-away counter.
- Trash empties a container but keeps it. Harder dishes appear later in the shift.

- The dining room starts empty: the host furnishes it in decorate mode (saved with the rest of their furniture).
  Customers sit on seats placed next to a table there; with no seats, everyone orders take-away at **Mang đi**.

Menu, ingredients, cooking methods and the kitchen layout live in `shared/src/restaurant.ts`. Food art is cut
from `client/assets-src/sheets/food/` by `client/assets-src/tools/cut_food.py` (boxes in `food_cuts.json`).
Interaction rules live in `shared/src/interaction.ts` (`planInteraction`), used by the server to apply actions and by the client to preview them.

### Fishing pond

- Outside, walk further left past the restaurant to the **🎣 Khu câu cá** gate; its doormat leads into a pond.
  The wooden dock at the top is where you walk, and fish swim back and forth in the water below (both players
  see the same fish, drawn as pixel-art sprites). The pond bed is decorated with seaweed, starfish, shells and a
  crab, while a turtle, jellyfish, octopus and seahorse drift by — decoration only, nothing to interact with.
- From the yard, the **🎣 Câu cá** card in the **☀️ Sẵn sàng mở quán?** picker walks you into the pond and
  opens a 10-minute fishing session for the room (`FISH_SECONDS` overrides it); once at the pond, **Bắt đầu câu**
  does the same. When the time is up, a summary shows every player's fish count and fishing money.
- Space drops the hook straight down from where you stand. When a fish bites, **hold** Space to reel it in —
  let go and it pulls back, too long and it escapes. A landed fish is sold straight into your own wallet;
  fishing money is never split.
- There are 15 fish in 5 rarities and 5 rods. A better rod makes rare fish bite more often and reels faster; buy
  the next level with your own money in the pond HUD. The rod level is saved per username (like the wallet).
- While at the pond, the sidebar swaps the orders panel for a read-only fish & rod guide: every species grouped by
  rarity with its sprite icon, name and price, every rod with its price and reel speed, the one you own highlighted
  (`client/src/ui/FishGuide.ts`). Leaving the pond brings the orders back.
- Fishing is not a shift: a shift can't start during a session, and a session can't start during a shift.
  The pond has no furniture, so decorate mode is off there. Numbers live in `shared/src/fishing.ts`; rendering
  and UI in `client/src/scenes/PondView.ts` and `client/src/ui/FishingPanel.ts`; species and decor sprites are cut
  from `client/assets-src/sheets/fish-sheet-1.jpg` / `fish-sheet-2.jpg` by `client/assets-src/tools/cut_fish.py`
  into `client/public/assets/fish/<id>.png` (long fish rotated level, head facing right) and
  `client/public/assets/pond/<name>.png`.

## Mobile

Phones always play in landscape (`client/src/forceLandscape.ts`):
- Android (and other browsers with the Screen Orientation API): the first tap goes fullscreen and locks landscape.
  ⛶ Full does the same again after leaving fullscreen.
- iPhone Safari can't lock the screen: a phone held upright gets the whole page turned 90° with CSS
  (`body.force-landscape`), so turning the phone sideways shows the game the right way up. Phaser input and the
  furniture drag use `toLayout` / `layoutRect` to read touches through the turn.

The game area scales to fit the screen; the side panel shows the orders, and cooking guides (**?**) open as pop-ups.
In build mode one finger either builds or steers: the **🚶 Đi lại / 🔨 Xây tiếp** button (top right of the game)
switches between dragging to build and the joystick. Picking a material switches back to building.
At the pond, the action button casts / pulls the hook back; hold the **🤜 GIỮ để kéo** button (or the action
button) to reel a biting fish.

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
- `FISH_SECONDS=20 npm run dev` — shorter fishing sessions for testing (server only; default 600).
- `FISH_TEST=1 npm run dev` — test fishing mode: every fish is a Cá rô that always bites (server only).
- `DEBUG_WARP=1 npm run dev` — enables the test-only `debug_warp` message that teleports the player (server only; used by e2e).
- `VITE_SERVER_URL=http://host:2567` — point the client at another game server.
- `npx playwright test` — e2e tests run on their own ports (server 2568, client 5174) and never reuse your dev server on 2567/5173.
- Each build writes a `version.json` (a fresh `BUILD_ID`, or your `BUILD_ID` env). Open pages fetch it at load,
  every 60s and when the tab is focused again; after a deploy they show an unavoidable **Có phiên bản mới** popup
  whose only button reloads the page (`client/src/updateChecker.ts`). Dev mode reports `"dev"`, so no popup locally.

## Decorating & saving

- The host presses **🪑 Trang trí** between shifts (not during a shift) to enter decorate mode.
- Drag furniture from the side panel into the shop to buy it; drag placed furniture to move it, or drop it on
  **🗑** to sell it back for 50%. Red outline = can't place there (machines, counters, other furniture).
  Rugs lie on the floor, so furniture can go on top of them.
- The **⟳** badge on a catalog card means the piece has artwork for all four sides and can be turned: press **R**
  (or the **⟳ Xoay** button) to rotate the piece you're placing or have selected. Pieces with a single image (rugs,
  most beds/chairs/cabinets, outdoor props, custom furniture from the portal) can't be turned and carry no badge.
- Phones and iPads go on a table top: drop them fully onto a table, the TV stand or the piano vanity and they
  sit raised on it. A table takes its tabletop items along when moved, and selling it sells them too (50% back
  each). A table that still has items on it can't be turned — clear the top first.
- **🔨 Xây** (build mode, in the yard) uses the same gestures as decorating for the one-cell pieces (trees,
  outdoor props, furniture): with no material picked, click a placed piece to select it, drag it to move it
  (green cell = fits, red = can't), drop it on **🗑** or press **Delete** to sell it back for 50%, **R** /
  **⟳ Xoay** to turn it (only pieces with all four side artworks can turn), and **Esc** or a click on an empty cell
  to deselect. Only the host can select / move /
  turn / sell; guests still build new pieces on empty cells only. The panel starts with no material picked
  (press the selected tool again to unpick it), and floors / walls / fences / doors keep the drag-to-draw tools.
  Placed pieces keep their rotation when the shop is saved and for the other player.
- One shop per username (`server/src/shop/SharedShop.ts`, save id = hash of the name), one instance per server so
  every room using it (as host's furniture or as a player's wallet) sees the same state. Money + furniture are saved (debounced ~1 s after each change, and when a room
  closes) and restored when the server starts its first room. (Kept in memory: assumes one server process.)
- Where saves go:
  - **Upstash Redis** when `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set. Use this in the
    cloud: Render free wipes its disk on every restart, sleep and deploy.
  - Otherwise JSON files in `server/data/shops/` (`DATA_DIR` env to change the folder) — fine locally.
  - The server logs which one it uses at startup (`Saving shops to …`).
- Database (`server/src/persistence/ShopStore.ts`): a **users** collection (name, createdAt, lastSeenAt, `shopId`)
  and a **shops** collection (money + furniture). A user record is created the first time a name joins, and links
  to that user's shop by `shopId`. Redis keys: `boba:user:<id>`, `boba:shop:<shopId>`; files: `data/users/`, `data/shops/`.
- Admin API for backups / restores, enabled when `ADMIN_TOKEN` is set (header `Authorization: Bearer <token>`):
  - `GET /admin/users/<name>`: user record + shop (money + furniture).
  - `PUT /admin/users/<name>/shop` with a shop save as JSON body (`{"money": 100, "decorations": [...]}`): replaces
    that user's shop, live (open rooms update right away). Example:
    `curl -X PUT -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" --data @backup.json https://<host>/admin/users/Ng%E1%BB%8Dc/shop`
- If the save can't be read (storage down), rooms can't be opened ("Không tải được quán") until it can, so an
  empty shop never overwrites the real save.
- Catalog and placement rules: `shared/src/decor.ts`.

### Custom furniture via the portal

The admin portal (`http://localhost:2567/portal`, requires `ADMIN_TOKEN`) has **🪑 Nội thất tuỳ chỉnh**: upload one
PNG/JPG showing several items on a plain background, press **Phân tích** to cut them out in the browser, then define
each piece (name, price, category, floor/wall/tabletop type, footprint, art height, rotation, role, table surface)
and press **Lưu**. Saved pieces apply to both decorate and build mode for every player; players already in the game
must reload the page to see them. Definitions and cut-out PNGs are stored with the same backend as the shops
(Upstash Redis or `server/data/`, see below) and served at `/custom-decor/<kind>.png`. The portal also lists the added
pieces and can delete them, unless a shop still owns one.

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
- At the pond: Space casts the hook / pulls it back; hold Space to reel a biting fish (the action button works the same).
  You can also start a session from the yard with the **🎣 Câu cá** card in the shift picker.
- Decorate / build modes: **R** (or **⟳ Xoay**) turns the piece being placed or selected (only pieces with all four
  side artworks can turn), **Delete** sells the selected yard piece, **Esc** (or a click on an empty cell) deselects.
- Touch devices: touch anywhere on the left half for a floating joystick (8 directions); the round button on the right is the action button and shows what it will do. Add `?touch=1` to the URL to force touch controls on desktop.
