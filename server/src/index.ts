import { timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { defineRoom, defineServer, matchMaker } from "colyseus";
import {
  MAX_PLAYERS,
  ROOMS_PATH,
  ROOM_NAME,
  SERVER_PORT,
  normalizeUsername,
  usernameKey,
  type RoomMetadata,
  type RoomsResponse,
} from "@boba/shared";
import { BobaShopRoom } from "./rooms/BobaShopRoom.js";
import { loadUser, parseShopSave, storageName } from "./persistence/ShopStore.js";
import { openShop } from "./shop/SharedShop.js";

const port = Number(process.env.PORT) || SERVER_PORT;

// Production / sharing: serve the built client (npm run build) from this same server,
// so the game and the WebSocket share one origin/port (needed for tunnels and free hosts).
const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../client/dist");
const serveClient = existsSync(path.join(clientDist, "index.html"));

/**
 * Admin API (backups / restores), enabled only when ADMIN_TOKEN is set. Send it as "Authorization: Bearer <token>".
 * - GET /admin/users/:name        -> the user record + their shop (money + furniture), live from the server
 * - PUT /admin/users/:name/shop   -> body = a shop save ({ money, decorations }): replaces that user's shop
 *   (creates the user if they never played). Works while the server runs: open rooms update right away.
 */
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? "";

function isAdmin(header: string | undefined): boolean {
  if (!ADMIN_TOKEN) return false;
  const given = Buffer.from(header?.replace(/^Bearer\s+/i, "") ?? "");
  const expected = Buffer.from(ADMIN_TOKEN);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

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
    app.use("/admin", (req, res, next) => {
      if (isAdmin(req.get("authorization"))) return next();
      res.status(ADMIN_TOKEN ? 401 : 404).json({ error: ADMIN_TOKEN ? "unauthorized" : "admin API disabled" });
    });
    app.get("/admin/users/:name", async (req, res) => {
      const name = normalizeUsername(req.params.name);
      if (!name) return void res.status(400).json({ error: "bad name" });
      try {
        const key = usernameKey(name);
        const user = await loadUser(key);
        if (!user) return void res.status(404).json({ error: "user not found" });
        const shop = await openShop(user.name, key, false);
        res.json({ user, shop: shop.snapshot() });
      } catch (err) {
        console.error("[admin] read failed", err);
        res.status(500).json({ error: String(err) });
      }
    });
    app.put("/admin/users/:name/shop", express.json({ limit: "1mb" }), async (req, res) => {
      const name = normalizeUsername(req.params.name);
      if (!name) return void res.status(400).json({ error: "bad name" });
      try {
        const save = parseShopSave(req.body);
        const shop = await openShop(name, usernameKey(name), false);
        const dropped = await shop.replace(save);
        console.log(`[admin] restored shop of ${name}: $${shop.money}, ${shop.pieces.length} decorations (${dropped} dropped)`);
        res.json({ ok: true, shopId: shop.shopId, money: shop.money, decorations: shop.pieces.length, dropped });
      } catch (err) {
        console.error("[admin] restore failed", err);
        res.status(500).json({ error: String(err) });
      }
    });
    if (serveClient) app.use(express.static(clientDist));
  },
});

server.listen(port);
console.log(`[BobaShop] Colyseus server listening on ws://localhost:${port}`);
console.log(`[BobaShop] Saving users + shops to ${storageName}`);
console.log(`[BobaShop] Admin API ${ADMIN_TOKEN ? "enabled" : "disabled (set ADMIN_TOKEN to enable)"}`);
if (serveClient) console.log(`[BobaShop] Serving client from ${clientDist} → http://localhost:${port}`);
