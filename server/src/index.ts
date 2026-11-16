import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { defineRoom, defineServer, matchMaker } from "colyseus";
import { MAX_PLAYERS, ROOMS_PATH, ROOM_NAME, SERVER_PORT, type RoomMetadata, type RoomsResponse } from "@boba/shared";
import { BobaShopRoom } from "./rooms/BobaShopRoom.js";
import { storageName } from "./persistence/ShopStore.js";

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
    // Lobby: rooms currently open and who's inside. Public + CORS: the client may be hosted elsewhere (GitHub Pages).
    app.get(ROOMS_PATH, async (_req, res) => {
      const rooms = await matchMaker.query({ name: ROOM_NAME });
      const now = Date.now();
      const body: RoomsResponse = {
        rooms: rooms
          .map((room) => {
            const meta = room.metadata as Partial<RoomMetadata> | undefined;
            const createdAt = room.createdAt ? new Date(room.createdAt).getTime() : now;
            return {
              id: room.roomId,
              name: meta?.name ?? "Phòng",
              players: meta?.players ?? [],
              maxPlayers: MAX_PLAYERS,
              createdAt: Number.isFinite(createdAt) ? createdAt : now,
            };
          })
          .sort((a, b) => b.createdAt - a.createdAt), // newest first
        now,
      };
      res.set("Access-Control-Allow-Origin", "*").set("Cache-Control", "no-store").json(body);
    });
    if (serveClient) app.use(express.static(clientDist));
  },
});

server.listen(port);
console.log(`[BobaShop] Colyseus server listening on ws://localhost:${port}`);
console.log(`[BobaShop] Saving shops to ${storageName}`);
if (serveClient) console.log(`[BobaShop] Serving client from ${clientDist} → http://localhost:${port}`);
