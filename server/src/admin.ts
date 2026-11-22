import { timingSafeEqual } from "node:crypto";
import express, { type Application } from "express";
import { areaOf, normalizeUsername, usernameKey } from "@boba/shared";
import { deleteUserRecords, listUsers, loadUser, parseShopSave } from "./persistence/ShopStore.js";
import { forgetShop, openShop, type Piece, type RefundMode } from "./shop/SharedShop.js";

/**
 * Admin API (backups / restores / the /portal admin page), enabled only when ADMIN_TOKEN is set.
 * Send the token as "Authorization: Bearer <ADMIN_TOKEN>"; the token is never logged or put in URLs.
 * - GET    /admin/users                     -> all users with money and furniture counts per venue
 * - GET    /admin/users/:name               -> the user record + their shop (money + furniture), live from the server
 * - PUT    /admin/users/:name/shop          -> body = a shop save ({ money, decorations }): replaces that user's shop
 *   (creates the user if they never played). Works while the server runs: open rooms update right away.
 * - DELETE /admin/users/:name               -> body { confirm: true }: deletes the user's record and shop save
 *   (money + furniture) from storage, no backup. 409 while the user is in a room; the shop's late
 *   saves are blocked, so a deleted user can't be written back.
 * - GET    /admin/users/:name/decorations   -> that user's furniture with venue (tea shop / restaurant)
 * - PATCH  /admin/users/:name/money        -> body { set } (new total, >= 0) or { delta } (add/remove)
 * - DELETE /admin/users/:name/decorations -> body { ids } or { venue } ("shop" | "restaurant"),
 *   optional { refund: "full" | "none" } (default full): removed pieces refund their FULL price
 * - GET    /admin/users/:name/tiles     -> that user's yard tiles grouped by kind (label, shape, price, count)
 * - DELETE /admin/users/:name/tiles     -> body { kinds } (tile kind array) or { all: true }, optional
 *   { refund: "full" | "none" } (default full): removed tiles refund their FULL price per cell
 * - POST   /admin/decorations/reset         -> body { venue: "restaurant", refund: "full", dryRun? }:
 *   removes every user's restaurant furniture (dryRun previews the totals without changing anything)
 */
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? "";
const JSON_BODY = express.json({ limit: "100kb" });

function isAdmin(header: string | undefined): boolean {
  if (!ADMIN_TOKEN) return false;
  const given = Buffer.from(header?.replace(/^Bearer\s+/i, "") ?? "");
  const expected = Buffer.from(ADMIN_TOKEN);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** A refund mode from a request body: default "full", 400 on anything else. */
function parseRefundMode(value: unknown): RefundMode | undefined {
  return value === undefined ? "full" : value === "full" || value === "none" ? value : undefined;
}

/** The open shop of a user by display name, or a 404 response if they never played. */
async function shopOfUser(name: string) {
  const user = await loadUser(usernameKey(name));
  if (!user) return { error: 404 as const };
  return { shop: await openShop(user.name, user.key, false) };
}

export function registerAdminRoutes(app: Application): void {
  app.use("/admin", (req, res, next) => {
    if (isAdmin(req.get("authorization"))) return next();
    res.status(ADMIN_TOKEN ? 401 : 404).json({ error: ADMIN_TOKEN ? "unauthorized" : "admin API disabled" });
  });

  app.get("/admin/users", async (_req, res) => {
    try {
      const rows = await Promise.all(
        (await listUsers()).map(async (user) => {
          const shop = await openShop(user.name, user.key, false);
          const pieces = shop.piecesByVenue();
          return {
            name: user.name,
            key: user.key,
            money: shop.money,
            lastSeenAt: user.lastSeenAt,
            counts: {
              shop: pieces.filter((p) => p.venue === "shop").length,
              restaurant: pieces.filter((p) => p.venue === "restaurant").length,
              tiles: shop.tiles.size,
            },
          };
        }),
      );
      res.json(rows);
    } catch (err) {
      console.error("[admin] list users failed", err);
      res.status(500).json({ error: String(err) });
    }
  });

  app.get("/admin/users/:name", async (req, res) => {
    const name = normalizeUsername(req.params.name);
    if (!name) return void res.status(400).json({ error: "bad name" });
    try {
      const user = await loadUser(usernameKey(name));
      if (!user) return void res.status(404).json({ error: "user not found" });
      const shop = await openShop(user.name, user.key, false);
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

  app.delete("/admin/users/:name", JSON_BODY, async (req, res) => {
    const name = normalizeUsername(req.params.name);
    if (!name) return void res.status(400).json({ error: "bad name" });
    if ((req.body ?? {}).confirm !== true) {
      return void res.status(400).json({ error: "body must be { confirm: true }" });
    }
    try {
      const user = await loadUser(usernameKey(name));
      if (!user) return void res.status(404).json({ error: "user not found" });
      const shop = await openShop(user.name, user.key, false);
      if (shop.isInUse()) return void res.status(409).json({ error: "user is in a room" });
      // Report the values that are about to be lost, then stop the shop's late saves before deleting.
      const money = shop.money;
      const decorations = shop.pieces.length;
      forgetShop(user.key);
      await deleteUserRecords(user);
      console.log(`[admin] deleted user ${name} ($${money}, ${decorations} decoration(s))`);
      res.json({ ok: true, name, money, decorations });
    } catch (err) {
      console.error("[admin] delete user failed", err);
      res.status(500).json({ error: String(err) });
    }
  });

  app.get("/admin/users/:name/decorations", async (req, res) => {
    const name = normalizeUsername(req.params.name);
    if (!name) return void res.status(400).json({ error: "bad name" });
    try {
      const found = await shopOfUser(name);
      if ("error" in found) return void res.status(404).json({ error: "user not found" });
      res.json({ name, money: found.shop.money, pieces: found.shop.piecesByVenue() });
    } catch (err) {
      console.error("[admin] read decorations failed", err);
      res.status(500).json({ error: String(err) });
    }
  });

  app.patch("/admin/users/:name/money", JSON_BODY, async (req, res) => {
    const name = normalizeUsername(req.params.name);
    if (!name) return void res.status(400).json({ error: "bad name" });
    const body = (req.body ?? {}) as { set?: unknown; delta?: unknown };
    const hasSet = body.set !== undefined;
    const hasDelta = body.delta !== undefined;
    const amount = hasSet ? body.set : body.delta;
    if (hasSet === hasDelta || !Number.isInteger(amount) || (hasSet && (amount as number) < 0)) {
      return void res.status(400).json({ error: "body must have exactly one integer field: set (>= 0) or delta" });
    }
    try {
      const found = await shopOfUser(name);
      if ("error" in found) return void res.status(404).json({ error: "user not found" });
      const shop = found.shop;
      const applied = hasSet ? shop.adjustMoney((amount as number) - shop.money) : shop.adjustMoney(amount as number);
      console.log(`[admin] money of ${name} ${hasSet ? `set to $${shop.money}` : `adjusted by $${applied} -> $${shop.money}`}`);
      res.json({ ok: true, money: shop.money, applied });
    } catch (err) {
      console.error("[admin] money update failed", err);
      res.status(500).json({ error: String(err) });
    }
  });

  app.delete("/admin/users/:name/decorations", JSON_BODY, async (req, res) => {
    const name = normalizeUsername(req.params.name);
    if (!name) return void res.status(400).json({ error: "bad name" });
    const body = (req.body ?? {}) as { ids?: unknown; venue?: unknown; refund?: unknown };
    const hasIds = body.ids !== undefined;
    const hasVenue = body.venue !== undefined;
    if (!hasIds && !hasVenue) return void res.status(400).json({ error: "ids or venue is required" });
    if (hasIds && (!Array.isArray(body.ids) || body.ids.some((id) => typeof id !== "string"))) {
      return void res.status(400).json({ error: "ids must be an array of strings" });
    }
    if (hasVenue && body.venue !== "shop" && body.venue !== "restaurant") {
      return void res.status(400).json({ error: "venue must be \"shop\" or \"restaurant\"" });
    }
    const refund = parseRefundMode(body.refund);
    if (!refund) return void res.status(400).json({ error: "refund must be \"full\" or \"none\"" });
    try {
      const found = await shopOfUser(name);
      if ("error" in found) return void res.status(404).json({ error: "user not found" });
      const shop = found.shop;
      const ids = hasIds ? (body.ids as string[]) : undefined;
      const venue = hasVenue ? (body.venue as "shop" | "restaurant") : undefined;
      const selector: string[] | ((piece: Piece) => boolean) =
        ids && venue
          ? (piece) => ids.includes(piece.id) && areaOf(piece) === venue
          : ids ?? ((piece) => areaOf(piece) === venue!);
      const { removed, refunded } = shop.removePieces(selector, refund);
      console.log(`[admin] removed ${removed} decoration(s) of ${name}, refunded $${refunded}`);
      res.json({ ok: true, removed, refunded, money: shop.money });
    } catch (err) {
      console.error("[admin] remove decorations failed", err);
      res.status(500).json({ error: String(err) });
    }
  });

  app.get("/admin/users/:name/tiles", async (req, res) => {
    const name = normalizeUsername(req.params.name);
    if (!name) return void res.status(400).json({ error: "bad name" });
    try {
      const found = await shopOfUser(name);
      if ("error" in found) return void res.status(404).json({ error: "user not found" });
      const tiles = found.shop.tilesByKind();
      res.json({ name, money: found.shop.money, tiles, total: found.shop.tiles.size });
    } catch (err) {
      console.error("[admin] read tiles failed", err);
      res.status(500).json({ error: String(err) });
    }
  });

  app.delete("/admin/users/:name/tiles", JSON_BODY, async (req, res) => {
    const name = normalizeUsername(req.params.name);
    if (!name) return void res.status(400).json({ error: "bad name" });
    const body = (req.body ?? {}) as { kinds?: unknown; all?: unknown; refund?: unknown };
    const hasKinds = body.kinds !== undefined;
    const hasAll = body.all !== undefined;
    if (hasKinds === hasAll) {
      return void res.status(400).json({ error: "body must have exactly one of kinds or all: true" });
    }
    if (hasAll && body.all !== true) return void res.status(400).json({ error: "all must be true" });
    if (hasKinds && (!Array.isArray(body.kinds) || !body.kinds.length || body.kinds.some((k) => typeof k !== "string"))) {
      return void res.status(400).json({ error: "kinds must be a non-empty array of tile kinds" });
    }
    const refund = parseRefundMode(body.refund);
    if (!refund) return void res.status(400).json({ error: "refund must be \"full\" or \"none\"" });
    try {
      const found = await shopOfUser(name);
      if ("error" in found) return void res.status(404).json({ error: "user not found" });
      const shop = found.shop;
      const selector = hasAll ? "all" : (body.kinds as string[]);
      const { removed, refunded } = shop.removeTiles(selector, refund);
      console.log(`[admin] removed ${removed} tile(s) of ${name}, refunded $${refunded}`);
      res.json({ ok: true, removed, refunded, money: shop.money });
    } catch (err) {
      console.error("[admin] remove tiles failed", err);
      res.status(500).json({ error: String(err) });
    }
  });

  app.post("/admin/decorations/reset", JSON_BODY, async (req, res) => {
    const body = (req.body ?? {}) as { venue?: unknown; refund?: unknown; dryRun?: unknown };
    if (body.venue !== "restaurant") {
      return void res.status(400).json({ error: "only venue \"restaurant\" is allowed" });
    }
    const refund = parseRefundMode(body.refund);
    if (!refund) return void res.status(400).json({ error: "refund must be \"full\" or \"none\"" });
    if (body.dryRun !== undefined && typeof body.dryRun !== "boolean") {
      return void res.status(400).json({ error: "dryRun must be a boolean" });
    }
    const dryRun = body.dryRun === true;
    try {
      let users = 0;
      let pieces = 0;
      let refundTotal = 0;
      for (const user of await listUsers()) {
        const shop = await openShop(user.name, user.key, false);
        if (dryRun) {
          const restaurantPieces = shop.piecesByVenue().filter((p) => p.venue === "restaurant");
          if (!restaurantPieces.length) continue;
          users++;
          pieces += restaurantPieces.length;
          refundTotal += restaurantPieces.reduce((sum, p) => sum + p.price, 0);
        } else {
          const { removed, refunded } = shop.removePieces((piece) => areaOf(piece) === "restaurant", refund);
          if (!removed) continue;
          users++;
          pieces += removed;
          refundTotal += refunded;
        }
      }
      if (dryRun) return void res.json({ users, pieces, refund: refundTotal });
      console.log(`[admin] restaurant reset: ${users} user(s), ${pieces} piece(s) removed, $${refundTotal} refunded`);
      res.json({ users, pieces, refund: refundTotal, removed: pieces, refunded: refundTotal });
    } catch (err) {
      console.error("[admin] restaurant reset failed", err);
      res.status(500).json({ error: String(err) });
    }
  });
}
