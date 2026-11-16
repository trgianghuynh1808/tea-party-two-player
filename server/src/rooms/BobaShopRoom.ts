import { Room, ServerError, type Client } from "colyseus";
import {
  DRINKS,
  EMPTY_CUP,
  EMPTY_HAND,
  FAST_SERVICE_TIP,
  GamePhase,
  SHIFT_SECONDS,
  MAX_ACTIVE_ORDERS,
  ORDER_DURATION_SECONDS,
  ORDER_SPAWN_SECONDS,
  MAX_PLAYERS,
  SHARED_SHOP_ID,
  SHOP_FULL_ERROR_CODE,
  STATIONS,
  ServerEvents,
  StationType,
  canPlaceDecoration,
  normalizeRotation,
  getDecorationDef,
  defaultCharacterOf,
  getCharacter,
  isGender,
  refundFor,
  snapToGrid,
  DECOR_GRID,
  findNearestStationDef,
  planInteraction,
  PLAYER_SPEED,
  resolveCollisions,
  cupContents,
  getDrink,
  makeCup,
  type DeliveredEvent,
  type DrinkDef,
  type PositionMessage,
} from "@boba/shared";
import { BobaShopState, Decoration, Order, Player, Station } from "@boba/shared/schema";
import { loadShop, saveShop } from "../persistence/ShopStore.js";

/** Wait this long after the last change before writing the shop save (batches rapid edits). */
const SAVE_DEBOUNCE_MS = 1000;

/** Only one shop room may exist per server process (see onCreate). */
let shopRoomOpen = false;

const FIRST_ORDER_DELAY_SECONDS = 2;
/** Override shift length for quick testing, e.g. SHIFT_SECONDS=20 npm run dev. */
const SHIFT_DURATION = Number(process.env.SHIFT_SECONDS) || SHIFT_SECONDS;
const DELIVERY_CLEAR_SECONDS = 0.8;
/** Restoring a save: how many grid steps a piece may be pushed down to fit the current layout. */
const RESTORE_NUDGE_STEPS = 12;

const SPAWN_POINTS = [
  { x: 300, y: 400 },
  { x: 500, y: 400 },
];

/**
 * Movement anti-teleport: each player earns travel budget at PLAYER_SPEED * MOVE_BUDGET_SLACK per second,
 * capped so that bursts of delayed packets still pass but warping across the shop does not.
 */
const MOVE_BUDGET_SLACK = 1.3;
const MOVE_BUDGET_CAP = PLAYER_SPEED * 1.5;
/** Collision corrections smaller than this are accepted silently (float noise between client and server). */
const COLLISION_TOLERANCE = 2;
const DIRECTIONS = new Set<string>(["up", "down", "left", "right"]);

interface MoveBudget {
  budget: number;
  lastAt: number;
}

export class BobaShopRoom extends Room {
  maxClients = MAX_PLAYERS;
  state = new BobaShopState();

  private moveBudgets = new Map<string, MoveBudget>();
  private deliveryTimers = new Map<string, number>();
  private decorationSeq = 0;
  private orderSeq = 0;
  private orderSpawnTimer = FIRST_ORDER_DELAY_SECONDS;
  private saveTimer?: ReturnType<typeof setTimeout>;
  /**
   * False when the saved shop couldn't be read (storage down): we then never save, so an empty
   * shop can't overwrite the real save. Players can still play; progress just isn't kept.
   */
  private canSave = true;

  messages = {
    position: (client: Client, payload: PositionMessage) => {
      this.handlePosition(client, payload);
    },
    interact: (client: Client) => {
      this.handleInteract(client);
    },
    buy_decoration: (client: Client, payload: { kind: string; x: number; y: number; rotation?: number }) => {
      this.handleBuyDecoration(client, payload);
    },
    move_decoration: (client: Client, payload: { id: string; x: number; y: number; rotation?: number }) => {
      this.handleMoveDecoration(client, payload);
    },
    sell_decoration: (client: Client, payload: { id: string }) => {
      this.handleSellDecoration(client, payload);
    },
    start_shift: () => {
      if (this.state.phase !== GamePhase.Playing) this.startShift();
    },
  };

  async onCreate() {
    // Everyone shares one shop. joinOrCreate only lands here when no joinable room exists,
    // so if one is already open it must be full: refuse instead of opening a second shop.
    if (shopRoomOpen) throw new ServerError(SHOP_FULL_ERROR_CODE, "Shop is full");
    shopRoomOpen = true;

    // Restore the shared shop (money + furniture) from a previous session.
    await this.restoreShop(SHARED_SHOP_ID);

    for (const def of STATIONS) {
      const station = new Station();
      station.id = def.id;
      station.type = def.type;
      station.x = def.x;
      station.y = def.y;
      this.state.stations.set(def.id, station);
    }

    // Server-authoritative simulation at 60Hz; patches go out at the default patch rate.
    this.setSimulationInterval((deltaTime) => this.update(deltaTime / 1000), 1000 / 60);
  }

  onJoin(client: Client, options: { gender?: unknown; character?: unknown } = {}) {
    const usedColors = new Set([...this.state.players.values()].map((p) => p.colorIndex));
    const colorIndex = usedColors.has(0) ? 1 : 0;
    const spawn = SPAWN_POINTS[colorIndex];

    const player = new Player();
    player.x = spawn.x;
    player.y = spawn.y;
    player.colorIndex = colorIndex;
    // Character picked on the home screen; fall back to the default one of the gender (older clients).
    const character = getCharacter(options.character) ?? defaultCharacterOf(isGender(options.gender) ? options.gender : "male");
    player.character = character.id;
    player.gender = character.gender;
    this.state.players.set(client.sessionId, player);
    this.resetMoveBudget(client.sessionId);
    console.log(`[BobaShopRoom] ${client.sessionId} joined (${this.clients.length}/${this.maxClients})`);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.moveBudgets.delete(client.sessionId);
    console.log(`[BobaShopRoom] ${client.sessionId} left`);
  }

  async onDispose() {
    shopRoomOpen = false;
    await this.flushSave();
  }

  // ---------------------------------------------------------------- Persistence

  private async restoreShop(shopId: string) {
    try {
      const save = await loadShop(shopId);
      if (!save) return;
      this.state.money = save.money;
      for (const d of save.decorations) {
        // Re-validate in case the layout or catalog changed since the save.
        const def = getDecorationDef(d.kind);
        const rotation = def ? normalizeRotation(def, d.rotation) : 0;
        // Pieces that no longer fit (e.g. under the back wall / machines added later) are nudged down
        // a few grid steps instead of being dropped.
        let y = d.y;
        for (let step = 0; step < RESTORE_NUDGE_STEPS && !canPlaceDecoration(d.kind, d.x, y, this.state.decorations, undefined, rotation); step++) {
          y += DECOR_GRID;
        }
        if (!canPlaceDecoration(d.kind, d.x, y, this.state.decorations, undefined, rotation)) continue;
        this.addDecoration(d.kind, d.x, y, rotation);
      }
      console.log(`[BobaShopRoom] restored shop ${shopId}: $${save.money}, ${this.state.decorations.length} decorations`);
    } catch (err) {
      this.canSave = false;
      console.error(`[BobaShopRoom] failed to load shop ${shopId}; saving disabled for this room`, err);
    }
  }

  /** Save soon (debounced). Call after anything that changes money or furniture. */
  private scheduleSave() {
    if (!this.canSave) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.flushSave(), SAVE_DEBOUNCE_MS);
  }

  private async flushSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    if (!this.canSave) return;
    try {
      await saveShop(SHARED_SHOP_ID, {
        version: 1,
        money: this.state.money,
        decorations: this.state.decorations.map((d) => ({ kind: d.kind, x: d.x, y: d.y, rotation: d.rotation })),
      });
    } catch (err) {
      console.error(`[BobaShopRoom] failed to save shop ${SHARED_SHOP_ID}`, err);
    }
  }

  private update(dt: number) {
    this.updateMachines(dt);

    if (this.state.phase === GamePhase.Playing) {
      this.updateOrders(dt);
      this.state.shiftTimeLeft = Math.max(0, this.state.shiftTimeLeft - dt);
      if (this.state.shiftTimeLeft <= 0) this.endShift();
    }

    // Delivered drinks disappear from the counter after a short delay.
    for (const [stationId, remaining] of this.deliveryTimers) {
      const left = remaining - dt;
      if (left > 0) {
        this.deliveryTimers.set(stationId, left);
        continue;
      }
      const station = this.state.stations.get(stationId);
      if (station) {
        station.item = EMPTY_HAND;
        station.progress = 0;
      }
      this.deliveryTimers.delete(stationId);
    }
  }

  /** Reset the kitchen and start a new timed shift. Total shop money is kept. */
  private startShift() {
    this.state.orders.clear();
    this.state.stations.forEach((station) => {
      station.item = EMPTY_HAND;
      station.progress = 0;
    });
    this.deliveryTimers.clear();

    this.state.players.forEach((player, sessionId) => {
      const spawn = SPAWN_POINTS[player.colorIndex] ?? SPAWN_POINTS[0];
      player.x = spawn.x;
      player.y = spawn.y;
      player.teleportSeq++;
      player.heldItem = EMPTY_HAND;
      this.resetMoveBudget(sessionId);
    });

    this.state.shiftEarnings = 0;
    this.state.servedCount = 0;
    this.state.missedCount = 0;
    this.state.shiftTimeLeft = SHIFT_DURATION;
    this.orderSpawnTimer = FIRST_ORDER_DELAY_SECONDS;
    this.state.phase = GamePhase.Playing;
  }

  private endShift() {
    this.state.phase = GamePhase.Ended;
    this.state.shiftTimeLeft = 0;
    // Customers still waiting at closing time are not counted as missed.
    this.state.orders.clear();
  }

  /** Timed machines: advance progress; when done, the ingredient is added to the placed cup. */
  private updateMachines(dt: number) {
    for (const def of STATIONS) {
      if (def.type !== StationType.Machine || !def.ingredient || !def.processSeconds) continue;
      const station = this.state.stations.get(def.id);
      if (!station || station.item === EMPTY_HAND || station.progress >= 1) continue;

      station.progress = Math.min(1, station.progress + dt / def.processSeconds);
      if (station.progress >= 1) {
        station.item = makeCup([...cupContents(station.item), def.ingredient]);
      }
    }
  }

  private updateOrders(dt: number) {
    // Customers walk out when their order times out.
    for (let i = this.state.orders.length - 1; i >= 0; i--) {
      const order = this.state.orders[i];
      order.timeLeft = Math.max(0, order.timeLeft - dt);
      if (order.timeLeft <= 0) {
        this.state.orders.splice(i, 1);
        this.state.missedCount++;
        this.broadcast(ServerEvents.OrderExpired, { drinkName: getDrink(order.drinkId)?.name ?? order.drinkId });
      }
    }

    if (this.state.players.size === 0) return;
    this.orderSpawnTimer -= dt;
    if (this.orderSpawnTimer <= 0) {
      this.orderSpawnTimer = ORDER_SPAWN_SECONDS;
      if (this.state.orders.length < MAX_ACTIVE_ORDERS) {
        const order = new Order();
        order.id = "order_" + ++this.orderSeq;
        order.drinkId = DRINKS[Math.floor(Math.random() * DRINKS.length)].id;
        order.duration = ORDER_DURATION_SECONDS;
        order.timeLeft = ORDER_DURATION_SECONDS;
        this.state.orders.push(order);
      }
    }
  }

  // ---------------------------------------------------------------- Movement

  private resetMoveBudget(sessionId: string) {
    this.moveBudgets.set(sessionId, { budget: MOVE_BUDGET_CAP, lastAt: Date.now() });
  }

  /** Accept a client-reported position if it is reachable and not inside a station; otherwise snap the client back. */
  private handlePosition(client: Client, payload: PositionMessage) {
    const player = this.state.players.get(client.sessionId);
    const move = this.moveBudgets.get(client.sessionId);
    if (!player || !move) return;
    // Sent before the client saw our last teleport: ignore instead of undoing the teleport.
    if (Number(payload?.teleportSeq) !== player.teleportSeq) return;
    const x = Number(payload?.x);
    const y = Number(payload?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    const now = Date.now();
    move.budget = Math.min(MOVE_BUDGET_CAP, move.budget + ((now - move.lastAt) / 1000) * PLAYER_SPEED * MOVE_BUDGET_SLACK);
    move.lastAt = now;

    const dist = Math.hypot(x - player.x, y - player.y);
    if (dist > move.budget) {
      // Too fast (or a huge lag spike): keep the server position and make the client snap to it.
      player.teleportSeq++;
      return;
    }
    move.budget -= dist;

    const resolved = resolveCollisions({ x, y });
    player.x = resolved.x;
    player.y = resolved.y;
    if (DIRECTIONS.has(payload.direction)) player.direction = payload.direction;
    if (Math.hypot(resolved.x - x, resolved.y - y) > COLLISION_TOLERANCE) player.teleportSeq++;
  }

  private handleInteract(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const fail = (reason: string) => client.send(ServerEvents.InteractFailed, { reason });
    const def = findNearestStationDef(player);
    const station = def && this.state.stations.get(def.id);
    if (!def || !station) return fail("Không có quầy nào gần đây");

    // Same rules the client uses to preview the action (see shared/src/interaction.ts).
    const plan = planInteraction(def, {
      phase: this.state.phase,
      held: player.heldItem,
      stationItem: station.item,
      stationProgress: station.progress,
      orderedDrinkIds: this.state.orders.map((o) => o.drinkId),
    });
    if (!plan.ok) return fail(plan.reason);

    switch (plan.kind) {
      case "take_cup":
        player.heldItem = EMPTY_CUP;
        return;
      case "add_ingredient":
        player.heldItem = plan.nextItem;
        return;
      case "start_machine":
      case "put_down":
        // Timed machines: updateMachines() adds the ingredient when progress reaches 1.
        station.item = player.heldItem;
        station.progress = 0;
        player.heldItem = EMPTY_HAND;
        return;
      case "pick_up":
        player.heldItem = station.item;
        station.item = EMPTY_HAND;
        station.progress = 0;
        return;
      case "trash":
        player.heldItem = EMPTY_HAND;
        return;
      case "deliver":
        return this.deliver(client, player, station, plan.drink);
    }
  }

  private deliver(client: Client, player: Player, station: Station, drink: DrinkDef) {
    // Serve the most urgent matching order (planInteraction already checked one exists).
    let index = -1;
    this.state.orders.forEach((o, i) => {
      if (o.drinkId === drink.id && (index < 0 || o.timeLeft < this.state.orders[index].timeLeft)) index = i;
    });
    if (index < 0) return;

    const order = this.state.orders[index];
    const tip = order.timeLeft > order.duration / 2 ? FAST_SERVICE_TIP : 0;
    this.state.orders.splice(index, 1);

    station.item = player.heldItem;
    player.heldItem = EMPTY_HAND;
    this.state.money += drink.price + tip;
    this.state.shiftEarnings += drink.price + tip;
    this.state.servedCount++;
    this.scheduleSave();
    this.deliveryTimers.set(station.id, DELIVERY_CLEAR_SECONDS);

    const event: DeliveredEvent = { by: client.sessionId, drinkName: drink.name, amount: drink.price, tip };
    this.broadcast(ServerEvents.Delivered, event);
  }

  // ---------------------------------------------------------------- Decorations (furniture)

  private addDecoration(kind: string, x: number, y: number, rotation = 0): Decoration {
    const deco = new Decoration();
    deco.id = "deco_" + ++this.decorationSeq;
    deco.kind = kind;
    deco.x = x;
    deco.y = y;
    deco.rotation = rotation;
    this.state.decorations.push(deco);
    return deco;
  }

  /** Decorating is only allowed between shifts. Returns an error message, or undefined if allowed. */
  private decorateBlockedReason(): string | undefined {
    return this.state.phase === GamePhase.Playing ? "Đang trong ca, trang trí sau khi hết ca nhé" : undefined;
  }

  private handleBuyDecoration(client: Client, payload: { kind: string; x: number; y: number; rotation?: number }) {
    const fail = (reason: string) => client.send(ServerEvents.InteractFailed, { reason });
    const blocked = this.decorateBlockedReason();
    if (blocked) return fail(blocked);

    const def = getDecorationDef(payload?.kind);
    if (!def) return;
    const x = snapToGrid(Number(payload.x));
    const y = snapToGrid(Number(payload.y));
    const rotation = normalizeRotation(def, payload.rotation);
    if (this.state.money < def.price) return fail(`Không đủ tiền (cần $${def.price})`);
    if (!canPlaceDecoration(def.kind, x, y, this.state.decorations, undefined, rotation)) return fail("Không đặt được ở đây");

    this.state.money -= def.price;
    this.addDecoration(def.kind, x, y, rotation);
    this.scheduleSave();
  }

  /** Move and/or turn a placed piece (rotation omitted = keep the current one). */
  private handleMoveDecoration(client: Client, payload: { id: string; x: number; y: number; rotation?: number }) {
    const fail = (reason: string) => client.send(ServerEvents.InteractFailed, { reason });
    const blocked = this.decorateBlockedReason();
    if (blocked) return fail(blocked);

    const deco = this.state.decorations.find((d) => d.id === payload?.id);
    const def = deco && getDecorationDef(deco.kind);
    if (!deco || !def) return;
    const x = snapToGrid(Number(payload.x));
    const y = snapToGrid(Number(payload.y));
    const rotation = payload.rotation === undefined ? deco.rotation : normalizeRotation(def, payload.rotation);
    if (!canPlaceDecoration(deco.kind, x, y, this.state.decorations, deco.id, rotation)) return fail("Không đặt được ở đây");

    deco.x = x;
    deco.y = y;
    deco.rotation = rotation;
    this.scheduleSave();
  }

  private handleSellDecoration(client: Client, payload: { id: string }) {
    const blocked = this.decorateBlockedReason();
    if (blocked) return client.send(ServerEvents.InteractFailed, { reason: blocked });

    const index = this.state.decorations.findIndex((d) => d.id === payload?.id);
    if (index < 0) return;
    const def = getDecorationDef(this.state.decorations[index].kind);
    this.state.decorations.splice(index, 1);
    if (def) this.state.money += refundFor(def);
    this.scheduleSave();
  }
}
