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

## Controls

- WASD / arrow keys: move
- Space: interact with the nearest station (highlighted)
  - Cup shelf → take a cup
  - Tea dispenser → put the cup down, wait for it to fill, press Space again to pick it up
  - Pearl pot → add pearls
  - Delivery counter → deliver for +$25 (shared money)
- 1 / 2: buy a decoration (plant $50 / lamp $75) at your position
