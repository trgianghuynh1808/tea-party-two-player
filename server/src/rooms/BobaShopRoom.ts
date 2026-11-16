import { Room, ServerError, type Client, type Deferred } from "colyseus";
import {
  DRINKS,
  EMPTY_CUP,
  EMPTY_HAND,
  FAST_SERVICE_TIP,
  GamePhase,
  JoinError,
  SHIFT_SECONDS,
  MAX_ACTIVE_ORDERS,
  MAX_PLAYERS,
  CustomerKind,
  GROUP_EXTRA_TIME_PER_DRINK,
  MACHINE_OVERFLOW_SECONDS,
  MISSED_ORDER_PENALTY,
  PICKY_FAST_BONUS,
  VIP_DURATION_SECONDS,
  VIP_PRICE_MULTIPLIER,
  baseOrderDuration,
  comboBonusRate,
  getCustomer,
  orderDrinkIds,
  orderSpawnInterval,
  pendingDrinkIds,
  pendingOrderDrinkIds,
  pickCustomerKind,
  RECONNECT_GRACE_SECONDS,
  REPLACED_CLOSE_CODE,
  STATIONS,
  ServerEvents,
  StationType,
  defaultCharacterOf,
  getCharacter,
  isGender,
  normalizeRoomTitle,
  normalizeUsername,
  usernameKey,
  findNearestStationDef,
  planInteraction,
  PLAYER_SPEED,
  resolveCollisions,
  cupContents,
  getDrink,
  makeCup,
  type DeliveredEvent,
  type DrinkDef,
  type MachineOverflowEvent,
  type OrderExpiredEvent,
  type JoinOptions,
  type PositionMessage,
  type RoomMetadata,
} from "@boba/shared";
import { BobaShopState, Decoration, Order, Player, Station } from "@boba/shared/schema";
import { shopOf, type Piece, type SharedShop, type ShopEvent } from "../shop/SharedShop.js";

const FIRST_ORDER_DELAY_SECONDS = 2;
/** Override shift length for quick testing, e.g. SHIFT_SECONDS=20 npm run dev. */
const SHIFT_DURATION = Number(process.env.SHIFT_SECONDS) || SHIFT_SECONDS;
const DELIVERY_CLEAR_SECONDS = 0.8;
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

/** Validated join request (returned by onAuth, available as client.auth in onJoin). */
interface JoinAuth {
  name: string;
  key: string;
  deviceId: string;
}

/** Where each username currently plays, across all rooms (one seat per name). */
interface Seat {
  room: BobaShopRoom;
  sessionId: string;
  deviceId: string;
  online: boolean;
}
const seats = new Map<string, Seat>();

export class BobaShopRoom extends Room<{ state: BobaShopState; metadata: RoomMetadata }> {
  /**
   * One spare connection: a player coming back (same name) joins as a new client while their old,
   * dropped connection still holds its seat. The real limit (MAX_PLAYERS players) is checked in onAuth.
   */
  maxClients = MAX_PLAYERS + 1;
  state = new BobaShopState();

  /** sessionId -> username key of the player on that session. */
  private sessionNames = new Map<string, string>();
  /** Dropped sessions waiting to reconnect (rejecting one ends its wait). */
  private reconnections = new Map<string, Deferred<Client>>();
  /** Sessions whose player was handed over to a newer session (or moved to another room): leaving must not remove it. */
  private replaced = new Set<string>();
  /** Username key of whoever opened the room, and their shop (the furniture shown here). */
  private hostKey = "";
  private hostShop?: SharedShop;
  private unsubscribeShop?: () => void;
  /** Username key -> stop mirroring that player's wallet into their Player.money. */
  private walletSubs = new Map<string, () => void>();
  /** Every shop this room changed (flushed when the room closes). */
  private touchedShops = new Set<SharedShop>();

  private moveBudgets = new Map<string, MoveBudget>();
  private deliveryTimers = new Map<string, number>();
  private orderSeq = 0;
  private orderSpawnTimer = FIRST_ORDER_DELAY_SECONDS;

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

  async onCreate(options: Partial<JoinOptions> = {}) {
    // The room shows the furniture of whoever opens it: load their shop before anyone joins.
    const host = normalizeUsername(options.username);
    if (!host) throw new ServerError(JoinError.BAD_NAME, "Tên không hợp lệ");
    this.hostKey = usernameKey(host);
    const hostShop = shopOf(this.hostKey);
    await this.loadShop(hostShop);
    this.hostShop = hostShop;
    this.touchedShops.add(hostShop);
    this.mirrorShop();
    this.unsubscribeShop = hostShop.subscribe((event) => this.onShopEvent(event));

    this.state.hostName = host;
    this.state.roomName = normalizeRoomTitle(options.roomName, `Phòng của ${host}`);
    this.updateListing();

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

  // ---------------------------------------------------------------- Players: join / drop / come back / leave

  /** Check the username and that there's a seat (a returning player reuses their own). */
  async onAuth(_client: Client, options: Partial<JoinOptions> = {}): Promise<JoinAuth> {
    const name = normalizeUsername(options.username);
    if (!name) throw new ServerError(JoinError.BAD_NAME, "Tên không hợp lệ");
    const key = usernameKey(name);
    const deviceId = typeof options.deviceId === "string" ? options.deviceId.slice(0, 64) : "";

    const seat = seats.get(key);
    // Same name still connected from another browser: someone else is using it. From the same browser
    // it's our own stale tab (closed but not noticed yet, or still open): the new tab takes over.
    if (seat?.online && seat.deviceId !== deviceId) {
      throw new ServerError(JoinError.NAME_TAKEN, `Tên “${name}” đang có người dùng, chọn tên khác nhé`);
    }
    const returning = seat?.room === this;
    if (this.state.players.size - (returning ? 1 : 0) >= MAX_PLAYERS) {
      throw new ServerError(JoinError.ROOM_FULL, "Phòng đã đủ người");
    }
    // The player's own wallet: their share of each shift goes there.
    await this.loadShop(shopOf(key));
    return { name, key, deviceId };
  }

  onJoin(client: Client, options: Partial<JoinOptions> = {}) {
    const { name, key, deviceId } = client.auth as JoinAuth;
    const seat = seats.get(key);
    let player: Player;
    if (seat?.room === this) {
      // Coming back under the same name: keep the same character, position and held cup.
      player = this.takeOver(seat.sessionId, client.sessionId);
    } else {
      // A name can only sit in one room: leaving the old one (if any) for this one.
      seat?.room.releaseName(key);
      player = this.createPlayer(options);
    }
    player.name = name;
    player.online = true;
    player.host = key === this.hostKey;
    player.money = shopOf(key).money;
    this.state.players.set(client.sessionId, player);
    this.sessionNames.set(client.sessionId, key);
    this.watchWallet(key);
    seats.set(key, { room: this, sessionId: client.sessionId, deviceId, online: true });
    this.resetMoveBudget(client.sessionId);
    this.updateListing();
    console.log(`[BobaShopRoom] ${name} joined ${this.roomId} (${this.state.players.size}/${MAX_PLAYERS})`);
  }

  /** Lost connection without leaving (tab closed, network): keep the seat for a while. */
  onDrop(client: Client) {
    if (this.replaced.has(client.sessionId)) return; // handed over already: onLeave cleans up
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    player.online = false;
    this.setSeatOnline(client.sessionId, false);
    this.reconnections.set(client.sessionId, this.allowReconnection(client, RECONNECT_GRACE_SECONDS));
    this.updateListing();
    console.log(`[BobaShopRoom] ${player.name} dropped from ${this.roomId}, seat kept ${RECONNECT_GRACE_SECONDS}s`);
  }

  /** Same connection came back (the SDK reconnects by itself after short network drops). */
  onReconnect(client: Client) {
    this.reconnections.delete(client.sessionId);
    const player = this.state.players.get(client.sessionId);
    if (player) player.online = true;
    this.setSeatOnline(client.sessionId, true);
    this.updateListing();
  }

  /** Left for good: clicked "Rời", or didn't come back in time. */
  onLeave(client: Client) {
    const sessionId = client.sessionId;
    this.reconnections.delete(sessionId);
    if (this.replaced.delete(sessionId)) return; // the player lives on under another session (or room)

    const key = this.sessionNames.get(sessionId);
    this.sessionNames.delete(sessionId);
    if (key && seats.get(key)?.sessionId === sessionId) seats.delete(key);
    const name = this.state.players.get(sessionId)?.name;
    this.state.players.delete(sessionId);
    this.moveBudgets.delete(sessionId);
    if (key) this.unwatchWallet(key);
    this.updateListing();
    console.log(`[BobaShopRoom] ${name ?? sessionId} left ${this.roomId}`);
  }

  async onDispose() {
    this.unsubscribeShop?.();
    for (const off of this.walletSubs.values()) off();
    this.walletSubs.clear();
    for (const [key, seat] of seats) if (seat.room === this) seats.delete(key);
    await Promise.all([...this.touchedShops].map((shop) => shop.flush()));
  }

  /** The name joined another room: drop its player here without waiting for a reconnection. */
  releaseName(key: string) {
    for (const [sessionId, k] of this.sessionNames) {
      if (k !== key) continue;
      this.state.players.delete(sessionId);
      this.moveBudgets.delete(sessionId);
      this.sessionNames.delete(sessionId);
      this.disconnectSession(sessionId);
    }
    this.unwatchWallet(key);
    this.updateListing();
  }

  private createPlayer(options: Partial<JoinOptions>): Player {
    const usedColors = new Set([...this.state.players.values()].map((p) => p.colorIndex));
    const colorIndex = usedColors.has(0) ? 1 : 0;
    const spawn = SPAWN_POINTS[colorIndex];
    const player = new Player();
    player.x = spawn.x;
    player.y = spawn.y;
    player.colorIndex = colorIndex;
    // Character picked in the lobby; fall back to the default one of the gender (older clients).
    const character = getCharacter(options.character) ?? defaultCharacterOf(isGender(options.gender) ? options.gender : "male");
    player.character = character.id;
    player.gender = character.gender;
    return player;
  }

  /** Move the player of an old session to a new one, and disconnect the old session. */
  private takeOver(oldSessionId: string, newSessionId: string): Player {
    const old = this.state.players.get(oldSessionId);
    const player = old ? old.clone() : this.createPlayer({});
    player.teleportSeq++; // the new client starts exactly where the player was
    this.state.players.delete(oldSessionId);
    this.moveBudgets.delete(oldSessionId);
    this.sessionNames.delete(oldSessionId);
    this.disconnectSession(oldSessionId);
    console.log(`[BobaShopRoom] ${player.name} came back to ${this.roomId} (${oldSessionId} -> ${newSessionId})`);
    return player;
  }

  /** End an old session whose player was handed over: stop waiting for it, or close its tab. */
  private disconnectSession(sessionId: string) {
    this.replaced.add(sessionId);
    const pending = this.reconnections.get(sessionId);
    if (pending) {
      this.reconnections.delete(sessionId);
      pending.reject(new Error("replaced"));
    } else {
      this.clients.getById(sessionId)?.leave(REPLACED_CLOSE_CODE);
    }
  }

  private setSeatOnline(sessionId: string, online: boolean) {
    const key = this.sessionNames.get(sessionId);
    const seat = key ? seats.get(key) : undefined;
    if (seat?.sessionId === sessionId) seat.online = online;
  }

  /** Lobby listing: room title + who's inside. */
  private updateListing() {
    void this.setMetadata({
      name: this.state.roomName,
      players: [...this.state.players.values()].map((p) => ({ name: p.name, online: p.online })),
    });
  }

  // ---------------------------------------------------------------- Shops: host's furniture, players' wallets

  /** Load a shop save (once per server); a storage outage refuses the join instead of starting empty. */
  private async loadShop(shop: SharedShop) {
    try {
      await shop.load();
    } catch (err) {
      console.error("[BobaShopRoom] can't load a shop", err);
      throw new ServerError(JoinError.SHOP_UNAVAILABLE, "Không tải được quán, thử lại sau nhé");
    }
  }

  /** Keep Player.money in sync with the player's wallet (it may also change from another room). */
  private watchWallet(key: string) {
    if (this.walletSubs.has(key)) return;
    const shop = shopOf(key);
    this.touchedShops.add(shop);
    const off = shop.subscribe((event) => {
      if (event.type !== "money") return;
      for (const [sessionId, k] of this.sessionNames) {
        const player = k === key ? this.state.players.get(sessionId) : undefined;
        if (player) player.money = event.money;
      }
    });
    this.walletSubs.set(key, off);
  }

  /** Stop watching a wallet once no session of that name is left in the room. */
  private unwatchWallet(key: string) {
    if ([...this.sessionNames.values()].includes(key)) return;
    this.walletSubs.get(key)?.();
    this.walletSubs.delete(key);
  }

  /** Copy the host's furniture into this room's synced state. */
  private mirrorShop() {
    this.state.decorations.clear();
    for (const piece of this.hostShop?.pieces ?? []) this.state.decorations.push(this.toDecoration(piece));
  }

  private onShopEvent(event: ShopEvent) {
    const list = this.state.decorations;
    switch (event.type) {
      case "money":
        return; // wallets are mirrored per player (watchWallet)
      case "added":
        list.push(this.toDecoration(event.piece));
        return;
      case "moved": {
        const deco = list.find((d) => d.id === event.piece.id);
        if (!deco) return;
        deco.x = event.piece.x;
        deco.y = event.piece.y;
        deco.rotation = event.piece.rotation;
        return;
      }
      case "removed": {
        const index = list.findIndex((d) => d.id === event.id);
        if (index >= 0) list.splice(index, 1);
        return;
      }
    }
  }

  private toDecoration(piece: Piece): Decoration {
    const deco = new Decoration();
    deco.id = piece.id;
    deco.kind = piece.kind;
    deco.x = piece.x;
    deco.y = piece.y;
    deco.rotation = piece.rotation;
    return deco;
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
      if (station) this.clearStation(station);
      this.deliveryTimers.delete(stationId);
    }
  }

  /** Reset the kitchen and start a new timed shift. Players' wallets are kept. */
  private startShift() {
    this.state.orders.clear();
    this.state.stations.forEach((station) => this.clearStation(station));
    this.deliveryTimers.clear();

    this.state.players.forEach((player, sessionId) => {
      const spawn = SPAWN_POINTS[player.colorIndex] ?? SPAWN_POINTS[0];
      player.x = spawn.x;
      player.y = spawn.y;
      player.teleportSeq++;
      player.heldItem = EMPTY_HAND;
      player.shiftShare = 0;
      this.resetMoveBudget(sessionId);
    });

    this.state.shiftEarnings = 0;
    this.state.servedCount = 0;
    this.state.missedCount = 0;
    this.state.combo = 0;
    this.state.bestCombo = 0;
    this.state.shiftTimeLeft = SHIFT_DURATION;
    this.orderSpawnTimer = FIRST_ORDER_DELAY_SECONDS;
    this.state.phase = GamePhase.Playing;
  }

  private endShift() {
    this.state.phase = GamePhase.Ended;
    this.state.shiftTimeLeft = 0;
    // Customers still waiting at closing time are not counted as missed.
    this.state.orders.clear();
    this.splitEarnings();
  }

  /**
   * Split the shift's earnings equally between the players still in the room (a dropped player whose seat
   * is kept counts too). Leftover dollars go one each to the first players. A negative result (more
   * penalties than sales) is split the same way, and no wallet goes below zero.
   */
  private splitEarnings() {
    const team = [...this.state.players.entries()];
    if (team.length === 0) return;
    const total = this.state.shiftEarnings;
    const base = Math.trunc(total / team.length);
    const leftover = total - base * team.length;
    team.forEach(([sessionId, player], i) => {
      const share = base + (i < Math.abs(leftover) ? Math.sign(leftover) : 0);
      const key = this.sessionNames.get(sessionId);
      player.shiftShare = key ? shopOf(key).earn(share) : 0;
    });
    console.log(`[BobaShopRoom] ${this.roomId} shift ended: $${total} split between ${team.length} player(s)`);
  }

  /**
   * Timed machines: advance progress; when done, the ingredient is added to the placed cup.
   * During a shift, a finished cup left on the machine spills after MACHINE_OVERFLOW_SECONDS.
   */
  private updateMachines(dt: number) {
    for (const def of STATIONS) {
      if (def.type !== StationType.Machine || !def.ingredient || !def.processSeconds) continue;
      const station = this.state.stations.get(def.id);
      if (!station || station.item === EMPTY_HAND) continue;

      if (station.progress < 1) {
        station.progress = Math.min(1, station.progress + dt / def.processSeconds);
        if (station.progress >= 1) station.item = makeCup([...cupContents(station.item), def.ingredient]);
        continue;
      }

      if (this.state.phase !== GamePhase.Playing) continue;
      station.overflow = Math.min(1, station.overflow + dt / MACHINE_OVERFLOW_SECONDS);
      if (station.overflow >= 1) {
        this.clearStation(station);
        const event: MachineOverflowEvent = { machine: def.label };
        this.broadcast(ServerEvents.MachineOverflow, event);
      }
    }
  }

  private clearStation(station: Station) {
    station.item = EMPTY_HAND;
    station.progress = 0;
    station.overflow = 0;
  }

  /** Fraction of the current shift already played (0..1). */
  private shiftProgress() {
    return 1 - this.state.shiftTimeLeft / SHIFT_DURATION;
  }

  private updateOrders(dt: number) {
    // Customers walk out when their order times out.
    for (let i = this.state.orders.length - 1; i >= 0; i--) {
      const order = this.state.orders[i];
      order.timeLeft = Math.max(0, order.timeLeft - dt);
      if (order.timeLeft <= 0) {
        this.state.orders.splice(i, 1);
        this.missOrder(order);
      }
    }

    if (this.state.players.size === 0) return;
    this.orderSpawnTimer -= dt;
    if (this.orderSpawnTimer <= 0) {
      const progress = this.shiftProgress();
      this.orderSpawnTimer = orderSpawnInterval(progress);
      if (this.state.orders.length < MAX_ACTIVE_ORDERS) this.state.orders.push(this.createOrder(progress));
    }
  }

  private createOrder(progress: number): Order {
    const kind = pickCustomerKind(progress);
    const randomDrink = () => DRINKS[Math.floor(Math.random() * DRINKS.length)].id;
    const count = kind === CustomerKind.Group ? (progress >= 0.6 && Math.random() < 0.5 ? 3 : 2) : 1;
    const base = baseOrderDuration(progress);
    const duration =
      kind === CustomerKind.Vip ? VIP_DURATION_SECONDS : Math.round(base * (1 + GROUP_EXTRA_TIME_PER_DRINK * (count - 1)));

    const order = new Order();
    order.id = "order_" + ++this.orderSeq;
    order.kind = kind;
    order.drinks = Array.from({ length: count }, randomDrink).join(",");
    order.duration = duration;
    order.timeLeft = duration;
    return order;
  }

  /** A customer walked out: penalty, and the combo is lost. */
  private missOrder(order: Order) {
    this.state.missedCount++;
    this.state.combo = 0;
    // Settled when the shift ends (see splitEarnings).
    this.state.shiftEarnings -= MISSED_ORDER_PENALTY;

    const drinks = orderDrinkIds(order.drinks);
    const customer = getCustomer(order.kind);
    const drinkLabel = drinks.length === 1 ? (getDrink(drinks[0])?.name ?? drinks[0]) : `${drinks.length} món`;
    const event: OrderExpiredEvent = {
      label: order.kind === CustomerKind.Normal ? drinkLabel : `${customer.label}: ${drinkLabel}`,
      penalty: MISSED_ORDER_PENALTY,
    };
    this.broadcast(ServerEvents.OrderExpired, event);
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
      orderedDrinkIds: pendingOrderDrinkIds(this.state.orders),
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
        station.overflow = 0;
        player.heldItem = EMPTY_HAND;
        return;
      case "pick_up":
        player.heldItem = station.item;
        this.clearStation(station);
        return;
      case "trash":
        player.heldItem = EMPTY_HAND;
        return;
      case "deliver":
        return this.deliver(client, player, station, plan.drink);
    }
  }

  private deliver(client: Client, player: Player, station: Station, drink: DrinkDef) {
    // Serve the most urgent order still waiting for this drink (planInteraction already checked one exists).
    let index = -1;
    this.state.orders.forEach((o, i) => {
      if (!pendingDrinkIds(o.drinks, o.servedMask).includes(drink.id)) return;
      if (index < 0 || o.timeLeft < this.state.orders[index].timeLeft) index = i;
    });
    if (index < 0) return;
    const order = this.state.orders[index];

    // Mark the first matching undelivered slot of the order.
    const drinks = orderDrinkIds(order.drinks);
    const slot = drinks.findIndex((id, i) => id === drink.id && !(order.servedMask & (1 << i)));
    order.servedMask |= 1 << slot;

    station.item = player.heldItem;
    player.heldItem = EMPTY_HAND;
    this.deliveryTimers.set(station.id, DELIVERY_CLEAR_SECONDS);
    this.state.servedCount++;

    const served = drinks.filter((_, i) => order.servedMask & (1 << i)).length;
    const event: DeliveredEvent = { by: client.sessionId, drinkName: drink.name, served, total: drinks.length, amount: 0, notes: [] };
    if (served === drinks.length) {
      this.state.orders.splice(index, 1);
      Object.assign(event, this.payOrder(order, drinks));
    }
    this.broadcast(ServerEvents.Delivered, event);
  }

  /** Whole order delivered: compute the pay (customer rules + fast tip + combo) and add it. */
  private payOrder(order: Order, drinks: string[]): { amount: number; notes: string[] } {
    const notes: string[] = [];
    const base = drinks.reduce((sum, id) => sum + (getDrink(id)?.price ?? 0), 0);
    const fast = order.timeLeft > order.duration / 2;
    let amount = base;

    switch (order.kind as CustomerKind) {
      case CustomerKind.Vip:
        amount = base * VIP_PRICE_MULTIPLIER;
        notes.push(`VIP x${VIP_PRICE_MULTIPLIER}`);
        break;
      case CustomerKind.Picky:
        if (fast) {
          amount += PICKY_FAST_BONUS;
          notes.push(`khách khó tính hài lòng +$${PICKY_FAST_BONUS}`);
        } else {
          amount = Math.ceil(base / 2);
          notes.push("giao chậm, khách khó tính trả nửa giá");
        }
        break;
    }
    if (fast && order.kind !== CustomerKind.Picky) {
      const tip = FAST_SERVICE_TIP * drinks.length;
      amount += tip;
      notes.push(`tip nhanh +$${tip}`);
    }

    this.state.combo++;
    this.state.bestCombo = Math.max(this.state.bestCombo, this.state.combo);
    const comboBonus = Math.round(amount * comboBonusRate(this.state.combo));
    if (comboBonus > 0) {
      amount += comboBonus;
      notes.push(`combo x${this.state.combo} +$${comboBonus}`);
    }

    // Paid out to the players when the shift ends (see splitEarnings).
    this.state.shiftEarnings += amount;
    return { amount, notes };
  }

  // ---------------------------------------------------------------- Decorations (the host's furniture, paid from the host's wallet)

  /** Only the host decorates, and only between shifts. Returns an error message, or undefined if allowed. */
  private decorateBlockedReason(client: Client): string | undefined {
    if (!this.hostShop || this.sessionNames.get(client.sessionId) !== this.hostKey) {
      return `Chỉ chủ phòng (${this.state.hostName}) mới trang trí được`;
    }
    return this.state.phase === GamePhase.Playing ? "Đang trong ca, trang trí sau khi hết ca nhé" : undefined;
  }

  private handleBuyDecoration(client: Client, payload: { kind: string; x: number; y: number; rotation?: number }) {
    const error = this.decorateBlockedReason(client) ?? this.hostShop!.buy(payload?.kind, payload?.x, payload?.y, payload?.rotation);
    if (error) client.send(ServerEvents.InteractFailed, { reason: error });
  }

  /** Move and/or turn a placed piece (rotation omitted = keep the current one). */
  private handleMoveDecoration(client: Client, payload: { id: string; x: number; y: number; rotation?: number }) {
    const error = this.decorateBlockedReason(client) ?? this.hostShop!.move(payload?.id, payload?.x, payload?.y, payload?.rotation);
    if (error) client.send(ServerEvents.InteractFailed, { reason: error });
  }

  private handleSellDecoration(client: Client, payload: { id: string }) {
    const blocked = this.decorateBlockedReason(client);
    if (blocked) return client.send(ServerEvents.InteractFailed, { reason: blocked });
    this.hostShop!.sell(payload?.id);
  }
}
