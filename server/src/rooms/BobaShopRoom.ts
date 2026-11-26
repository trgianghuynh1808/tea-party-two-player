import { Room, ServerError, type Client, type Deferred } from "colyseus";
import {
  ALL_STATIONS,
  BURN_SECONDS,
  BURNT_ITEM,
  EMPTY_CUP,
  EMPTY_HAND,
  FAST_SERVICE_TIP,
  FISH_COUNT,
  FISH_SECONDS,
  GamePhase,
  HOOK_RADIUS,
  HOOK_SPEED,
  JoinError,
  MAX_PLAYERS,
  CustomerKind,
  GROUP_EXTRA_TIME_PER_DRINK,
  MACHINE_OVERFLOW_SECONDS,
  MISSED_ORDER_PENALTY,
  PICKY_FAST_BONUS,
  REEL_DECAY,
  REEL_START,
  REEL_TIMEOUT,
  VIP_DURATION_SECONDS,
  VIP_PRICE_MULTIPLIER,
  WATER,
  biteChance,
  comboBonusRate,
  getCustomer,
  getFish,
  getMenuItem,
  getRod,
  getVenue,
  isVenue,
  orderDrinkIds,
  pendingDrinkIds,
  pendingDrinksAt,
  pendingOrderDrinkIds,
  pickCustomerKind,
  pickFishSpecies,
  seatTableMap,
  tablesWaiting,
  SEAT_COOLDOWN_SECONDS,
  SEAT_RETRY_SECONDS,
  TAKEAWAY_CHANCE,
  CHARACTERS,
  RECONNECT_GRACE_SECONDS,
  REPLACED_CLOSE_CODE,
  PROCESSES,
  RESTAURANT_SPAWN_POINTS,
  ARRIVAL_SPAWN_POINTS,
  ServerEvents,
  StationType,
  defaultCharacterOf,
  getCharacter,
  isGender,
  normalizeRoomTitle,
  normalizeUsername,
  usernameKey,
  findInteractTarget,
  planInteraction,
  planLieDown,
  planServeTable,
  bedSpots,
  bedExitPoint,
  findBedSpot,
  areaOf,
  doorAt,
  isProcess,
  makeFood,
  venueMenu,
  venueOrderDuration,
  venueSpawnInterval,
  type BedSpot,
  type DebugWarpMessage,
  type FishDef,
  PLAYER_SPEED,
  resolveCollisions,
  cupContents,
  makeCup,
  PLAYER_RADIUS,
  cellRect,
  foodKey,
  inRect,
  isInYard,
  type BuildTilesMessage,
  type DeliveredEvent,
  type MenuItem,
  type MoveTileMessage,
  type ReelMessage,
  type SellTileMessage,
  type StartShiftMessage,
  type Venue,
  type MachineOverflowEvent,
  type OrderExpiredEvent,
  type JoinOptions,
  type PositionMessage,
  type RoomMetadata,
} from "@boba/shared";
import { BobaShopState, Decoration, Fish, Order, Player, Station } from "@boba/shared/schema";
import { openShop, shopOf, type Piece, type SharedShop, type ShopEvent } from "../shop/SharedShop.js";

const FIRST_ORDER_DELAY_SECONDS = 2;
/** Override shift length for quick testing, e.g. SHIFT_SECONDS=20 npm run dev. */
const shiftDuration = (venue: string) => Number(process.env.SHIFT_SECONDS) || getVenue(venue).shiftSeconds;
/** Override fishing session length for tests, e.g. FISH_SECONDS=20 (see FISH_SECONDS in @boba/shared). */
const fishDuration = () => Number(process.env.FISH_SECONDS) || FISH_SECONDS;
/**
 * Test mode for fishing (FISH_TEST=1): every fish spawns as a Cá rô that always bites, so e2e runs
 * don't depend on luck. Progression is unchanged, just deterministic.
 */
const FISH_TEST = process.env.FISH_TEST === "1";
/** Fish positions go to the schema at most this often (the sim runs at 60 Hz; patches cost bandwidth). */
const FISH_SYNC_SECONDS = 0.1;
const DELIVERY_CLEAR_SECONDS = 0.8;
const SPAWN_POINTS = [
  { x: 300, y: 400 },
  { x: 500, y: 400 },
];
const spawnPoints = (venue: string) => (venue === "restaurant" ? RESTAURANT_SPAWN_POINTS : SPAWN_POINTS);

/**
 * Movement anti-teleport: each player earns travel budget at PLAYER_SPEED * MOVE_BUDGET_SLACK per second,
 * capped so that bursts of delayed packets still pass but warping across the shop does not.
 */
const MOVE_BUDGET_SLACK = 1.3;
const MOVE_BUDGET_CAP = PLAYER_SPEED * 1.5;
/** Collision corrections smaller than this are accepted silently (float noise between client and server). */
const COLLISION_TOLERANCE = 2;
const DIRECTIONS = new Set<string>(["up", "down", "left", "right"]);

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface MoveBudget {
  budget: number;
  lastAt: number;
}

/** A fish as simulated (its synced body lives in the schema; this is the authoritative position). */
interface FishSim {
  x: number;
  y: number;
  dir: 1 | -1;
  species: string;
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
  /** Seat id -> seconds left before a new customer may sit there (the previous one is walking out). */
  private seatCooldowns = new Map<string, number>();

  // Fishing (room-internal sim state; the synced bits live in the schema, see Fish / Player fields)
  /** sessionId -> fish swimming positions (authoritative; synced to state.fish every FISH_SYNC_SECONDS). */
  private fishSim = new Map<string, FishSim>();
  private fishSyncTimer = 0;
  private fishSeq = 0;
  /** sessionId -> id of the fish on that player's hook. */
  private hookedFish = new Map<string, string>();
  /** sessionId -> reel held (true) or released; only matters while a fish is on the hook. */
  private reelHolding = new Map<string, boolean>();
  /** sessionId -> seconds since the fish took the hook (it escapes after REEL_TIMEOUT). */
  private hookTimer = new Map<string, number>();
  /** sessionId -> fish that already rolled on this player's current drop (one roll per drop each). */
  private biteRolled = new Map<string, Set<string>>();

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
    use_door: (client: Client) => {
      this.handleUseDoor(client);
    },
    build_tiles: (client: Client, payload: BuildTilesMessage) => {
      this.handleBuildTiles(client, payload);
    },
    move_tile: (client: Client, payload: MoveTileMessage) => {
      this.handleMoveTile(client, payload);
    },
    sell_tile: (client: Client, payload: SellTileMessage) => {
      this.handleSellTile(client, payload);
    },
    leave_bed: (client: Client) => {
      const player = this.state.players.get(client.sessionId);
      if (player?.bedId) this.getUp(client.sessionId, player);
    },
    start_shift: (client: Client, payload?: StartShiftMessage) => {
      // A shift can't run during a fishing session (the reverse guard is in handleStartFishing).
      if (this.state.fishPhase === "fishing") {
        return client.send(ServerEvents.InteractFailed, { reason: "Đang câu cá, chờ hết phiên câu nhé" });
      }
      if (this.state.phase !== GamePhase.Playing) this.startShift(isVenue(payload?.venue) ? payload.venue : "shop");
    },
    start_fishing: (client: Client) => {
      this.handleStartFishing(client);
    },
    cast: (client: Client) => {
      this.handleCast(client);
    },
    reel: (client: Client, payload: ReelMessage) => {
      this.handleReel(client, payload);
    },
    retract: (client: Client) => {
      this.handleRetract(client);
    },
    upgrade_rod: (client: Client) => {
      this.handleUpgradeRod(client);
    },
    // Registered only for e2e runs (server env DEBUG_WARP=1): teleports the player anywhere.
    ...(process.env.DEBUG_WARP === "1"
      ? {
          debug_warp: (client: Client, payload: DebugWarpMessage) => {
            this.handleDebugWarp(client, payload);
          },
        }
      : {}),
  };

  async onCreate(options: Partial<JoinOptions> = {}) {
    // The room shows the furniture of whoever opens it: load their shop before anyone joins.
    const host = normalizeUsername(options.username);
    if (!host) throw new ServerError(JoinError.BAD_NAME, "Tên không hợp lệ");
    this.hostKey = usernameKey(host);
    const hostShop = await this.openShop(host, this.hostKey);
    this.hostShop = hostShop;
    this.touchedShops.add(hostShop);
    this.mirrorShop();
    this.unsubscribeShop = hostShop.subscribe((event) => this.onShopEvent(event));

    this.state.hostName = host;
    this.state.roomName = normalizeRoomTitle(options.roomName, `Phòng của ${host}`);
    this.updateListing();

    for (const def of ALL_STATIONS) {
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
    await this.openShop(name, key);
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
    player.rodLevel = shopOf(key).rodLevel;
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
    const player = this.state.players.get(sessionId);
    // Their hook comes in and any fish on it goes free.
    if (player) this.clearHook(sessionId, player);
    const name = player?.name;
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
      const player = this.state.players.get(sessionId);
      if (player) this.clearHook(sessionId, player);
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
    // New players start outdoors, between the two places they can open.
    const spawn = ARRIVAL_SPAWN_POINTS[colorIndex];
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
    // The old connection's hook comes in (its fish goes free); the clone starts hookless.
    if (old) this.clearHook(oldSessionId, old);
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

  /** Open a player's user record + shop; a storage outage refuses the join instead of starting empty. */
  private async openShop(name: string, key: string): Promise<SharedShop> {
    try {
      return await openShop(name, key);
    } catch (err) {
      console.error("[BobaShopRoom] can't load a shop", err);
      throw new ServerError(JoinError.SHOP_UNAVAILABLE, "Không tải được quán, thử lại sau nhé");
    }
  }

  /**
   * Keep Player.money / Player.rodLevel in sync with the player's shop (both may also change from
   * another room: shifts pay into the wallet, fishing rod upgrades change the saved rod).
   */
  private watchWallet(key: string) {
    if (this.walletSubs.has(key)) return;
    const shop = shopOf(key);
    this.touchedShops.add(shop);
    const off = shop.subscribe((event) => {
      for (const [sessionId, k] of this.sessionNames) {
        if (k !== key) continue;
        const player = this.state.players.get(sessionId);
        if (!player) continue;
        if (event.type === "money") player.money = event.money;
        else if (event.type === "rodLevel") player.rodLevel = event.level;
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
    this.state.tiles.clear();
    for (const [key, kind] of this.hostShop?.tiles ?? []) this.state.tiles.set(key, kind);
    this.state.tileRotations.clear();
    for (const [key, rot] of this.hostShop?.tileRotations ?? []) this.state.tileRotations.set(key, rot);
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
      case "tiles":
        for (const [key, kind] of event.changes) {
          if (kind) this.state.tiles.set(key, kind);
          else this.state.tiles.delete(key);
        }
        return;
      case "tileRotations":
        for (const [key, rot] of event.changes) {
          if (rot === null) this.state.tileRotations.delete(key);
          else this.state.tileRotations.set(key, rot);
        }
        return;
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
    this.updateSleepers();

    if (this.state.phase === GamePhase.Playing) {
      this.updateOrders(dt);
      this.state.shiftTimeLeft = Math.max(0, this.state.shiftTimeLeft - dt);
      if (this.state.shiftTimeLeft <= 0) this.endShift();
    }

    this.updateFishing(dt);

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
  private startShift(venue: Venue) {
    this.state.venue = venue;
    this.state.orders.clear();
    this.seatCooldowns.clear();
    this.state.stations.forEach((station) => this.clearStation(station));
    this.deliveryTimers.clear();

    this.state.players.forEach((player, sessionId) => {
      const spawns = spawnPoints(venue);
      const spawn = spawns[player.colorIndex] ?? spawns[0];
      player.x = spawn.x;
      player.y = spawn.y;
      player.teleportSeq++;
      player.bedId = "";
      player.heldItem = EMPTY_HAND;
      player.shiftShare = 0;
      this.resetMoveBudget(sessionId);
    });

    this.state.shiftEarnings = 0;
    this.state.servedCount = 0;
    this.state.missedCount = 0;
    this.state.combo = 0;
    this.state.bestCombo = 0;
    this.state.shiftTimeLeft = shiftDuration(venue);
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
    this.updateCookers(dt);
    for (const def of ALL_STATIONS) {
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

  /**
   * Restaurant cookers: the placed ingredient gets the cooker's method when progress reaches 1. Hot cookers
   * then burn it if nobody takes it within BURN_SECONDS during a shift (it stays there as burnt food).
   */
  private updateCookers(dt: number) {
    for (const def of ALL_STATIONS) {
      if (def.type !== StationType.Cooker || !def.process || !isProcess(def.process)) continue;
      const station = this.state.stations.get(def.id);
      const key = station && foodKey(station.item);
      if (!station || key === undefined || station.item === BURNT_ITEM) continue;
      const process = PROCESSES[def.process];

      if (station.progress < 1) {
        station.progress = Math.min(1, station.progress + dt / process.seconds);
        if (station.progress >= 1) station.item = makeFood(`${key}.${def.process}`);
        continue;
      }

      if (!process.burns || this.state.phase !== GamePhase.Playing) continue;
      station.overflow = Math.min(1, station.overflow + dt / BURN_SECONDS);
      if (station.overflow >= 1) {
        station.item = BURNT_ITEM;
        station.overflow = 0;
        const event: MachineOverflowEvent = { machine: def.label, burnt: true };
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
    return 1 - this.state.shiftTimeLeft / shiftDuration(this.state.venue);
  }

  private updateOrders(dt: number) {
    // Customers walk out when their order times out.
    for (let i = this.state.orders.length - 1; i >= 0; i--) {
      const order = this.state.orders[i];
      order.timeLeft = Math.max(0, order.timeLeft - dt);
      if (order.timeLeft <= 0) {
        this.removeOrder(i);
        this.missOrder(order);
      }
    }

    for (const [seatId, left] of this.seatCooldowns) {
      if (left - dt > 0) this.seatCooldowns.set(seatId, left - dt);
      else this.seatCooldowns.delete(seatId);
    }

    if (this.state.players.size === 0) return;
    this.orderSpawnTimer -= dt;
    if (this.orderSpawnTimer <= 0) {
      const progress = this.shiftProgress();
      const venue = getVenue(this.state.venue);
      this.orderSpawnTimer = venueSpawnInterval(venue.id, progress);
      if (this.state.orders.length < venue.maxOrders) {
        const order = this.createOrder(progress);
        if (order) this.state.orders.push(order);
        // Every seat is taken: the next customer comes as soon as one frees up.
        else this.orderSpawnTimer = SEAT_RETRY_SECONDS;
      }
    }
  }

  /** The customers leave (served or walked out): their seats are free again after a short while. */
  private removeOrder(index: number) {
    const [order] = this.state.orders.splice(index, 1);
    for (const seatId of order?.seats ? order.seats.split(",") : []) this.seatCooldowns.set(seatId, SEAT_COOLDOWN_SECONDS);
  }

  /**
   * Free seats per table (seats next to a table, not taken by a customer or one just leaving).
   * `hasSeating` = false when the shop has no seat next to a table at all: customers then order take-away at the counter.
   */
  private freeSeating(): { hasSeating: boolean; free: Map<string, string[]> } {
    // The host's furniture in the venue of the shift (tea shop or restaurant).
    const venue = this.state.venue === "restaurant" ? "restaurant" : "shop";
    const seatTable = seatTableMap([...this.state.decorations].filter((d) => areaOf(d) === venue));
    const taken = new Set(this.seatCooldowns.keys());
    for (const o of this.state.orders) for (const id of o.seats ? o.seats.split(",") : []) taken.add(id);
    const free = new Map<string, string[]>();
    for (const [seatId, tableId] of seatTable) {
      if (taken.has(seatId)) continue;
      free.set(tableId, [...(free.get(tableId) ?? []), seatId]);
    }
    return { hasSeating: seatTable.size > 0, free };
  }

  /** A new customer (or group) walks in; undefined when there is no free seat for them. */
  private createOrder(progress: number): Order | undefined {
    let kind = pickCustomerKind(progress);
    const menu = venueMenu(this.state.venue, progress);
    const randomDrink = () => menu[Math.floor(Math.random() * menu.length)].id;
    let count = kind === CustomerKind.Group ? (progress >= 0.6 && Math.random() < 0.5 ? 3 : 2) : 1;

    // A group sits together at one table: fewer friends come if no table has room for all of them.
    // Some customers order take-away at the counter even when there are seats.
    let tableId = "";
    let seats: string[] = [];
    const seating = this.freeSeating();
    if (seating.hasSeating && Math.random() >= TAKEAWAY_CHANCE) {
      const pick = (n: number) => {
        const options = [...seating.free].filter(([, free]) => free.length >= n);
        if (!options.length) return undefined;
        const [table, free] = options[Math.floor(Math.random() * options.length)];
        return { table, seats: shuffle(free).slice(0, n) };
      };
      let spot = pick(count);
      while (!spot && count > 1) spot = pick(--count);
      if (!spot) return undefined;
      if (count === 1 && kind === CustomerKind.Group) kind = CustomerKind.Normal;
      tableId = spot.table;
      seats = spot.seats;
    }

    const base = venueOrderDuration(this.state.venue, progress);
    const duration =
      kind === CustomerKind.Vip ? VIP_DURATION_SECONDS : Math.round(base * (1 + GROUP_EXTRA_TIME_PER_DRINK * (count - 1)));

    const order = new Order();
    order.id = "order_" + ++this.orderSeq;
    order.kind = kind;
    order.drinks = Array.from({ length: count }, randomDrink).join(",");
    order.duration = duration;
    order.timeLeft = duration;
    order.tableId = tableId;
    order.seats = seats.join(",");
    order.looks = Array.from({ length: count }, () => CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)].id).join(",");
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
    const drinkLabel = drinks.length === 1 ? (getMenuItem(drinks[0])?.name ?? drinks[0]) : `${drinks.length} món`;
    const event: OrderExpiredEvent = {
      label: order.kind === CustomerKind.Normal ? drinkLabel : `${customer.label}: ${drinkLabel}`,
      penalty: MISSED_ORDER_PENALTY,
    };
    this.broadcast(ServerEvents.OrderExpired, event);
  }

  // ---------------------------------------------------------------- Fishing (a timed co-op session at the pond)
  //
  // Fully server-side: fish swim in the sim map (synced to state.fish every FISH_SYNC_SECONDS), hooks
  // sink and reels are pulled here. Clients only send cast / reel / retract intents. Fish sell straight
  // into the catcher's own wallet (no split), and rod upgrades are saved with the player's shop.

  /**
   * Run the fishing session while fishPhase === "fishing": the clock, the fish and every player's
   * hook / reel. Stops (and shows the summary) once fishTimeLeft hits zero.
   */
  private updateFishing(dt: number) {
    if (this.state.fishPhase !== "fishing") return;

    this.state.fishTimeLeft = Math.max(0, this.state.fishTimeLeft - dt);
    if (this.state.fishTimeLeft <= 0) return this.endFishing();

    // Fish swim back and forth in their lanes; hooked ones wait at the hook.
    this.fishSyncTimer += dt;
    const sync = this.fishSyncTimer >= FISH_SYNC_SECONDS;
    if (sync) this.fishSyncTimer = 0;
    for (const [id, sim] of this.fishSim) {
      const fish = this.state.fish.get(id);
      if (!fish || fish.hooked) continue;
      const def = getFish(sim.species);
      if (!def) continue;
      sim.x += sim.dir * def.speed * dt;
      if (sim.x <= WATER.left) {
        sim.x = WATER.left;
        sim.dir = 1;
      } else if (sim.x >= WATER.right) {
        sim.x = WATER.right;
        sim.dir = -1;
      }
      if (sync) {
        fish.x = sim.x;
        fish.dir = sim.dir;
      }
    }

    this.state.players.forEach((player, sessionId) => {
      if (player.hookState === "drop") this.updateHookDrop(sessionId, player, dt);
      else if (player.hookState === "reel") this.updateHookReel(sessionId, player, dt);
    });
  }

  /** Session over: summary on screen (fishPhase "ended"), everyone's hook in, pond emptied. */
  private endFishing() {
    this.state.fishPhase = "ended";
    this.state.fishTimeLeft = 0;
    this.state.players.forEach((player, sessionId) => this.clearHook(sessionId, player));
    this.state.fish.clear();
    this.fishSim.clear();
    this.fishSyncTimer = 0;
    console.log(`[BobaShopRoom] ${this.roomId} fishing session ended`);
  }

  /** Put a new fish in the pond: random species (weighted), lane and direction. */
  private spawnFish() {
    const def = FISH_TEST ? getFish("ca_ro")! : pickFishSpecies();
    const id = `fish_${++this.fishSeq}`;
    const y = WATER.top + 40 + Math.random() * (WATER.bottom - WATER.top - 80);
    const x = WATER.left + Math.random() * (WATER.right - WATER.left);
    const dir: 1 | -1 = Math.random() < 0.5 ? -1 : 1;
    this.fishSim.set(id, { x, y, dir, species: def.id });

    const fish = new Fish();
    fish.id = id;
    fish.species = def.id;
    fish.x = x;
    fish.y = y;
    fish.dir = dir;
    this.state.fish.set(id, fish);
  }

  private removeFish(id: string) {
    this.fishSim.delete(id);
    this.state.fish.delete(id);
  }

  /** A dropped hook sinks; the first fish it touches may take it (one roll per drop each), the floor reels it in. */
  private updateHookDrop(sessionId: string, player: Player, dt: number) {
    player.hookY += HOOK_SPEED * dt;
    const rolled = this.biteRolled.get(sessionId) ?? new Set<string>();
    this.biteRolled.set(sessionId, rolled);
    for (const [id, sim] of this.fishSim) {
      if (rolled.has(id)) continue;
      const fish = this.state.fish.get(id);
      if (!fish || fish.hooked) continue;
      if (Math.hypot(sim.x - player.hookX, sim.y - player.hookY) > HOOK_RADIUS) continue;
      const def = getFish(fish.species);
      if (!def) continue;
      rolled.add(id);
      // Rare fish shake hooks off: the rod's bite table decides (tests force the bite).
      if (!FISH_TEST && Math.random() >= biteChance(player.rodLevel, def.tier)) continue;
      // On the line: the fish freezes at the hook and reeling starts part-way through.
      sim.x = player.hookX;
      sim.y = player.hookY;
      fish.x = sim.x;
      fish.y = sim.y;
      fish.hooked = true;
      this.hookedFish.set(sessionId, id);
      this.hookTimer.set(sessionId, 0);
      player.hookState = "reel";
      player.reelProgress = REEL_START;
      return;
    }
    if (player.hookY >= WATER.bottom) this.clearHook(sessionId, player);
  }

  /** A fish on the line: holding gains reel progress, releasing loses it; not landed in time, it escapes. */
  private updateHookReel(sessionId: string, player: Player, dt: number) {
    const timer = (this.hookTimer.get(sessionId) ?? 0) + dt;
    this.hookTimer.set(sessionId, timer);
    const fishId = this.hookedFish.get(sessionId);
    const fish = fishId ? this.state.fish.get(fishId) : undefined;
    const def = fish ? getFish(fish.species) : undefined;
    if (!fish || !def) return this.loseHook(sessionId, player);

    const rod = getRod(player.rodLevel);
    const holding = this.reelHolding.get(sessionId) === true;
    player.reelProgress += holding ? dt * ((rod?.reel ?? 1) / def.hold) : -dt * REEL_DECAY;
    if (player.reelProgress >= 1) return this.landFish(sessionId, player, fish, def);
    if (player.reelProgress <= 0 || timer >= REEL_TIMEOUT) return this.loseHook(sessionId, player);
  }

  /** Landed: the fish sells straight into the catcher's own wallet (never split), and a new one spawns. */
  private landFish(sessionId: string, player: Player, fish: Fish, def: FishDef) {
    const key = this.sessionNames.get(sessionId);
    const earned = key ? shopOf(key).earn(def.price) : 0;
    player.fishCaught++;
    player.fishEarned += earned;
    player.lastCatch = def.id;
    player.catchSeq++;
    this.removeFish(fish.id);
    this.spawnFish();
    this.clearHook(sessionId, player);
  }

  /** The fish got away (progress hit zero, or nobody landed it within REEL_TIMEOUT). */
  private loseHook(sessionId: string, player: Player) {
    player.escapeSeq++;
    this.clearHook(sessionId, player);
  }

  /** Take the hook back: releases any fish on it and clears the player's fishing bookkeeping. */
  private clearHook(sessionId: string, player?: Player) {
    const fishId = this.hookedFish.get(sessionId);
    if (fishId) {
      const fish = this.state.fish.get(fishId);
      if (fish) fish.hooked = false;
    }
    this.hookedFish.delete(sessionId);
    this.hookTimer.delete(sessionId);
    this.reelHolding.delete(sessionId);
    this.biteRolled.delete(sessionId);
    if (player) player.hookState = "";
  }

  /** Start a fishing session: only from the pond, never during a shift, never twice in a row. */
  private handleStartFishing(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    const fail = (reason: string) => client.send(ServerEvents.InteractFailed, { reason });
    if (this.state.fishPhase === "fishing") return;
    if (this.state.phase === GamePhase.Playing) return fail("Đang trong ca làm, câu cá sau khi hết ca nhé");
    if (areaOf(player) !== "pond") return fail("Phải đứng ở ao hồ mới câu được");

    // A fresh session zeroes everyone's catch counters, then fills the pond.
    this.state.players.forEach((p) => {
      p.fishCaught = 0;
      p.fishEarned = 0;
    });
    this.state.fish.clear();
    this.fishSim.clear();
    const seconds = fishDuration();
    this.state.fishTimeLeft = seconds;
    for (let i = 0; i < FISH_COUNT; i++) this.spawnFish();
    this.state.fishPhase = "fishing";
    console.log(`[BobaShopRoom] ${this.roomId} fishing session started (${seconds}s)`);
  }

  /** Drop the hook at the player's position; it sinks until a fish takes it (or the floor reels it in). */
  private handleCast(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.hookState !== "" || this.state.fishPhase !== "fishing" || areaOf(player) !== "pond") return;
    player.hookX = player.x;
    player.hookY = WATER.top;
    player.hookState = "drop";
    this.biteRolled.set(client.sessionId, new Set());
  }

  /** Hold / release the reel (only matters while a fish is on the line). */
  private handleReel(client: Client, payload: ReelMessage) {
    if (!this.state.players.has(client.sessionId)) return;
    this.reelHolding.set(client.sessionId, payload?.holding === true);
  }

  /** Pull the hook back up before any fish took it. */
  private handleRetract(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.hookState !== "drop") return;
    this.clearHook(client.sessionId, player);
  }

  /** Buy the next rod level with the sender's own wallet (saved with their shop, mirrors to Player). */
  private handleUpgradeRod(client: Client) {
    const key = this.sessionNames.get(client.sessionId);
    if (!key) return;
    const error = shopOf(key).upgradeRod();
    if (error) client.send(ServerEvents.InteractFailed, { reason: error });
  }

  /** Test-only (server env DEBUG_WARP=1): put the player anywhere, e.g. onto the pond's doormat. */
  private handleDebugWarp(client: Client, payload: DebugWarpMessage) {
    const player = this.state.players.get(client.sessionId);
    const x = Number(payload?.x);
    const y = Number(payload?.y);
    if (!player || !Number.isFinite(x) || !Number.isFinite(y)) return;
    player.x = x;
    player.y = y;
    player.teleportSeq++;
    this.resetMoveBudget(client.sessionId);
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
    // Lying in bed: the player doesn't move until they get up (LeaveBed / Interact).
    if (player.bedId) return;

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

    // Positions only change area through a door (server teleport), never by walking.
    if (areaOf({ x, y }) !== areaOf(player)) {
      player.teleportSeq++;
      return;
    }
    // Walls in the yard come from the synced tiles (the same data the clients use to predict movement).
    const resolved = resolveCollisions({ x, y }, this.state.tiles);
    player.x = resolved.x;
    player.y = resolved.y;
    if (DIRECTIONS.has(payload.direction)) player.direction = payload.direction;
    if (Math.hypot(resolved.x - x, resolved.y - y) > COLLISION_TOLERANCE) player.teleportSeq++;
  }

  // ---------------------------------------------------------------- Beds

  /** Lie down in `bed`: the player stays at its rest point until they get up (clients draw them on the pillow). */
  private lieDown(sessionId: string, player: Player, bed: BedSpot) {
    player.bedId = bed.id;
    player.x = bed.rest.x;
    player.y = bed.rest.y;
    player.direction = "down";
    player.teleportSeq++;
    this.resetMoveBudget(sessionId);
  }

  /** Step out in front of the bed (or stay put if the bed is gone). */
  private getUp(sessionId: string, player: Player) {
    const bed = this.findBed(player.bedId);
    player.bedId = "";
    if (bed) {
      const p = bedExitPoint(bed, this.state.tiles);
      player.x = p.x;
      player.y = p.y;
    }
    player.direction = "down";
    player.teleportSeq++;
    this.resetMoveBudget(sessionId);
  }

  private findBed(id: string) {
    return findBedSpot(id, this.state.decorations, this.state.tiles);
  }

  /** Bed sold / erased: its sleeper gets up. Bed moved: its sleeper moves with it. */
  private updateSleepers() {
    this.state.players.forEach((player, sessionId) => {
      if (!player.bedId) return;
      const bed = this.findBed(player.bedId);
      if (!bed) return this.getUp(sessionId, player);
      if (bed.rest.x !== player.x || bed.rest.y !== player.y) this.lieDown(sessionId, player, bed);
    });
  }

  /** Through a door (tea shop, restaurant, pond): from the doormat outside to inside, or from the exit inside to the yard. */
  private handleUseDoor(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    // A little slack: the client reports positions every 50 ms.
    const at = doorAt(player, 24);
    if (!at) return;
    // Leaving the pond takes the hook in; any fish on it goes free (no escape counted).
    if (areaOf(player) === "pond") this.clearHook(client.sessionId, player);
    const outside = at.outside;
    const spawn = outside ? at.door.insideSpawn : at.door.outsideSpawn;
    player.bedId = "";
    player.x = spawn.x;
    player.y = spawn.y;
    player.direction = outside ? "up" : "down";
    player.teleportSeq++;
    this.resetMoveBudget(client.sessionId);
  }

  /** No solid tile on top of someone standing in the yard (shared by build and move_tile). */
  private blockedCell() {
    return (cx: number, cy: number) => {
      const r = cellRect(cx, cy);
      for (const p of this.state.players.values()) {
        if (isInYard(p) && inRect(p, r, PLAYER_RADIUS)) return true;
      }
      return false;
    };
  }

  /**
   * Building in the yard: the host's land, paid from the builder's own wallet. Guests may only build on empty
   * cells (no replacing, no eraser). Allowed during shifts too.
   */
  private handleBuildTiles(client: Client, payload: BuildTilesMessage) {
    const key = this.sessionNames.get(client.sessionId);
    if (!this.hostShop || !key) return;
    const payer = shopOf(key);
    const error = this.hostShop.build(
      payload?.tool,
      payload?.x0,
      payload?.y0,
      payload?.x1,
      payload?.y1,
      payload?.rotation,
      this.blockedCell(),
      payer,
    );
    if (error) client.send(ServerEvents.InteractFailed, { reason: error });
  }

  /**
   * Moving / turning a placed prop: host only (guests may only build on empty cells). The move is refused when
   * someone stands on the target cell. Allowed during shifts too, like building.
   */
  private handleMoveTile(client: Client, payload: MoveTileMessage) {
    if (!this.hostShop || this.sessionNames.get(client.sessionId) !== this.hostKey) {
      return client.send(ServerEvents.InteractFailed, { reason: `Chỉ chủ phòng (${this.state.hostName}) mới di chuyển được` });
    }
    const error = this.hostShop.moveTile(payload?.cx, payload?.cy, payload?.toCx, payload?.toCy, payload?.rotation, this.blockedCell());
    if (error) client.send(ServerEvents.InteractFailed, { reason: error });
  }

  /** Selling a placed prop: host only (the refund goes to their wallet). */
  private handleSellTile(client: Client, payload: SellTileMessage) {
    if (!this.hostShop || this.sessionNames.get(client.sessionId) !== this.hostKey) {
      return client.send(ServerEvents.InteractFailed, { reason: `Chỉ chủ phòng (${this.state.hostName}) mới bán được` });
    }
    const error = this.hostShop.sellTile(payload?.cx, payload?.cy);
    if (error) client.send(ServerEvents.InteractFailed, { reason: error });
  }

  private handleInteract(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const fail = (reason: string) => client.send(ServerEvents.InteractFailed, { reason });
    // In bed: the action key gets up.
    if (player.bedId) return this.getUp(client.sessionId, player);
    const orders = this.state.orders;
    const target = findInteractTarget(player, tablesWaiting(this.state.decorations, orders), bedSpots(this.state.decorations, this.state.tiles.entries()), player.direction);
    if (!target) return fail("Không có quầy nào gần đây");

    if (target.type === "bed") {
      const bedId = target.bed.id;
      let occupied = false;
      this.state.players.forEach((p) => (occupied ||= p.bedId === bedId));
      const plan = planLieDown({ held: player.heldItem, occupied });
      if (!plan.ok) return fail(plan.reason);
      this.lieDown(client.sessionId, player, target.bed);
      return;
    }

    // Serving customers seated at a table.
    if (target.type === "table") {
      const tableId = target.table.id;
      const plan = planServeTable({ phase: this.state.phase, held: player.heldItem, orderedDrinkIds: pendingDrinksAt(orders, tableId) });
      if (!plan.ok) return fail(plan.reason);
      if (plan.kind === "deliver") this.deliver(client, player, plan.item, tableId);
      return;
    }

    const def = target.def;
    const station = this.state.stations.get(def.id);
    if (!station) return fail("Không có quầy nào gần đây");

    // Same rules the client uses to preview the action (see shared/src/interaction.ts).
    const plan = planInteraction(def, {
      phase: this.state.phase,
      held: player.heldItem,
      stationItem: station.item,
      stationProgress: station.progress,
      // The delivery counter only serves take-away orders; seated customers are served at their table.
      orderedDrinkIds: pendingDrinksAt(orders, ""),
      seatedDrinkIds: pendingOrderDrinkIds(orders),
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
      case "set":
        // Restaurant kitchen: the plan says what ends up in hand and on the station.
        player.heldItem = plan.held;
        if (plan.station !== station.item || plan.start) {
          station.item = plan.station;
          station.progress = 0;
          station.overflow = 0;
        }
        return;
      case "deliver":
        // The cup stays on the counter for a moment (take-away).
        station.item = player.heldItem;
        this.deliveryTimers.set(station.id, DELIVERY_CLEAR_SECONDS);
        return this.deliver(client, player, plan.item, "");
    }
  }

  /** Serve a drink to an order at `tableId` ("" = take-away at the counter). */
  private deliver(client: Client, player: Player, drink: MenuItem, tableId: string) {
    // Serve the most urgent order there still waiting for this drink (the plan already checked one exists).
    let index = -1;
    this.state.orders.forEach((o, i) => {
      if (o.tableId !== tableId || !pendingDrinkIds(o.drinks, o.servedMask).includes(drink.id)) return;
      if (index < 0 || o.timeLeft < this.state.orders[index].timeLeft) index = i;
    });
    if (index < 0) return;
    const order = this.state.orders[index];

    // Mark the first matching undelivered slot of the order.
    const drinks = orderDrinkIds(order.drinks);
    const slot = drinks.findIndex((id, i) => id === drink.id && !(order.servedMask & (1 << i)));
    order.servedMask |= 1 << slot;

    player.heldItem = EMPTY_HAND;
    this.state.servedCount++;

    const served = drinks.filter((_, i) => order.servedMask & (1 << i)).length;
    const event: DeliveredEvent = { by: client.sessionId, orderId: order.id, drinkName: drink.name, served, total: drinks.length, amount: 0, notes: [] };
    if (served === drinks.length) {
      this.removeOrder(index);
      Object.assign(event, this.payOrder(order, drinks));
    }
    this.broadcast(ServerEvents.Delivered, event);
  }

  /** Whole order delivered: compute the pay (customer rules + fast tip + combo) and add it. */
  private payOrder(order: Order, drinks: string[]): { amount: number; notes: string[] } {
    const notes: string[] = [];
    const base = drinks.reduce((sum, id) => sum + (getMenuItem(id)?.price ?? 0), 0);
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
