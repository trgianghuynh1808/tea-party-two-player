import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { defineRoom, defineServer, matchMaker } from "colyseus";
import { LOBBY_PATH, MAX_PLAYERS, ROOM_NAME, SERVER_PORT, type LobbyInfo } from "@boba/shared";
import { BobaShopRoom } from "./rooms/BobaShopRoom.js";

const port = Number(process.env.PORT) || SERVER_PORT;

// Production / sharing: serve the built client (npm run build) from this same server,
// so the game and the WebSocket share one origin/port (needed for tunnels and free hosts).
const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../client/dist");
const serveClient = existsSync(path.join(clientDist, "index.html"));

const server = defineServer({
  rooms: {
    [ROOM_NAME]: defineRoom(BobaShopRoom),
  },
  express: (app) => {
    app.get("/health", (_req, res) => {
      res.json({ ok: true });
    });
    // Home screen status. Public + CORS: the client may be hosted elsewhere (GitHub Pages).
    app.get(LOBBY_PATH, async (_req, res) => {
      const [room] = await matchMaker.query({ name: ROOM_NAME });
      const info: LobbyInfo = { open: !!room, players: room?.clients ?? 0, maxPlayers: room?.maxClients ?? MAX_PLAYERS };
      res.set("Access-Control-Allow-Origin", "*").set("Cache-Control", "no-store").json(info);
    });
    if (serveClient) app.use(express.static(clientDist));
  },
});

server.listen(port);
console.log(`[BobaShop] Colyseus server listening on ws://localhost:${port}`);
if (serveClient) console.log(`[BobaShop] Serving client from ${clientDist} → http://localhost:${port}`);
