import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Encoder } from "@colyseus/schema";
import { defineRoom, defineServer, matchMaker } from "colyseus";
import {
  MAX_PLAYERS,
  ROOMS_PATH,
  ROOM_NAME,
  SERVER_PORT,
  type RoomMetadata,
  type RoomsResponse,
} from "@boba/shared";
import { BobaShopRoom } from "./rooms/BobaShopRoom.js";
import { registerAdminRoutes } from "./admin.js";
import { loadCustomCatalog, registerCustomDecorRoutes } from "./customDecor.js";
import { storageName } from "./persistence/ShopStore.js";

// Room state outgrew the 8 KB default encode buffer (caused "buffer overflow" lag).
Encoder.BUFFER_SIZE = 64 * 1024;

const port = Number(process.env.PORT) || SERVER_PORT;

// Production / sharing: serve the built client (npm run build) from this same server,
// so the game and the WebSocket share one origin/port (needed for tunnels and free hosts).
const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../client/dist");
const serveClient = existsSync(path.join(clientDist, "index.html"));

// Admin API + portal, enabled only when ADMIN_TOKEN is set (see src/admin.ts).
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? "";

const server = defineServer({
  rooms: {
    [ROOM_NAME]: defineRoom(BobaShopRoom),
  },
  express: (app) => {
    // Liveness probe for Render (healthCheckPath in render.yaml); deployed via the GitHub Action deploy hook.
    app.get("/health", (_req, res) => {
      // RENDER_GIT_COMMIT is set by Render: shows which commit is actually running.
      res.json({ ok: true, commit: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? null });
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
    registerAdminRoutes(app);
    // Public custom-furniture catalog + artwork PNGs (fetched by the client on page load).
    registerCustomDecorRoutes(app);
    // The admin portal page (HTML, no build step): free to load, the token is entered inside.
    app.get("/portal", (_req, res) => {
      res.sendFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../portal/index.html"));
    });
    // Same boba-cup icon as the game (client/public/favicon.svg), copied into server/portal so the
    // portal does not depend on the client build.
    app.get("/portal/favicon.svg", (_req, res) => {
      res.sendFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../portal/favicon.svg"));
    });
    if (serveClient) app.use(express.static(clientDist));
  },
});

// Portal-added custom furniture must be in the catalog before any shop opens: shop saves drop
// pieces whose kind is missing from the catalog, so this finishes before the server listens.
const customDecors = await loadCustomCatalog();

server.listen(port);
console.log(`[BobaShop] Colyseus server listening on ws://localhost:${port}`);
console.log(`[BobaShop] Saving users + shops to ${storageName}`);
console.log(`[BobaShop] Admin API ${ADMIN_TOKEN ? "enabled" : "disabled (set ADMIN_TOKEN to enable)"}`);
console.log(`[BobaShop] Custom furniture from the portal: ${customDecors} piece(s)`);
if (serveClient) console.log(`[BobaShop] Serving client from ${clientDist} → http://localhost:${port}`);
