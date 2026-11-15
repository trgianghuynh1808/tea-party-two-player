# Boba Shop Co-op

2-player online co-op boba tea shop game (npm workspaces monorepo).

- `server/` — Node.js + TypeScript + Colyseus 0.18 (`BobaShopRoom`, maxClients = 2)
- `client/` — Vite + TypeScript + Phaser 3.90 (placeholder shapes, no assets yet)
- `shared/` — constants, station layout, movement code and Colyseus Schema used by both sides

## Run

```bash
npm install
npm run dev   # server: ws://localhost:2567, client: http://localhost:5173
```

Open http://localhost:5173:

1. Player 1 clicks **Tạo phòng mới** → gets a 4-character room code (e.g. `XTM3`).
2. Player 2 enters the code and clicks **Vào phòng**, or opens the invite link (`?room=XTM3`, button **Sao chép link mời**).

Rooms are private (join by code only) and hold at most 2 players.
To play from another machine on the same LAN, open the **Network** URL printed by Vite (e.g. `http://192.168.x.x:5173`).

## Gameplay

- The shop starts closed: walk around and practice, then press **Bắt đầu ca** to open a 3-minute shift.
- At the end of the shift you get 1–3 stars based on shift earnings ($100 / $220 / $350), plus served/missed stats. Total shop money carries over between shifts.
- The counters (**Bàn**) in the middle hold one cup each: put a cup down / pick it up with Space to pass it to your teammate.
- Customers order drinks (see the **Đơn hàng** panel). Each order has a timer; serve it before it runs out.
- Every drink has its own recipe (ordered steps), shown in the **Menu** panel.
- Each machine adds one ingredient. Machines marked ⏱ take time: put the cup down, wait for "Xong!", press Space again to pick it up.
- Machines refuse steps that don't lead to any drink on the menu. Throw a cup in the trash bin to start over.
- Delivering pays the drink price, plus a $5 tip if served with more than half of the time left.

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
- The host's shop (money + furniture) is saved on the server in `server/data/shops/<shopId>.json`
  (`DATA_DIR` env to change the folder). The shop id lives in the host browser's localStorage, so creating
  a new room later from the same browser restores the shop. Players who join play in the host's shop.
- Catalog and placement rules: `shared/src/decor.ts`.

> Free cloud hosts such as Render free have an ephemeral disk: saves are lost when the instance restarts or
> sleeps. Saving works reliably when the server runs on your own machine (e.g. with the Cloudflare tunnel).

## Controls

- WASD / arrow keys: move
- Space: interact with the nearest station (highlighted). The hint at the bottom right shows what Space will do.
- Touch devices: touch anywhere on the left half for a floating joystick (8 directions); the round button on the right is the action button and shows what it will do. Add `?touch=1` to the URL to force touch controls on desktop.
