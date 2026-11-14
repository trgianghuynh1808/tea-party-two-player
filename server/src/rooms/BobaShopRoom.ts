import { Room, type Client } from "colyseus";
import {
  DECORATION_CATALOG,
  DRINK_PRICE,
  INTERACT_RANGE,
  Item,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  STATIONS,
  ServerEvents,
  StationType,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  directionFromInput,
  distanceToStation,
  stepMovement,
  type Direction,
  type MoveMessage,
} from "@boba/shared";
import { BobaShopState, Decoration, Player, Station } from "@boba/shared/schema";

const ROOM_CODES_CHANNEL = "$boba_room_codes";
const TEA_FILL_SECONDS = 1.5;
const DELIVERY_CLEAR_SECONDS = 0.8;
const SPAWN_POINTS = [
  { x: 300, y: 400 },
  { x: 500, y: 400 },
];

interface InputState {
  dx: number;
  dy: number;
}

const clampAxis = (v: unknown): number => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-1, Math.min(1, Math.round(n)));
};

export class BobaShopRoom extends Room {
  maxClients = 2;
  state = new BobaShopState();

  private moveInputs = new Map<string, InputState>();
  private deliveryTimers = new Map<string, number>();
  private decorationSeq = 0;

  messages = {
    move: (client: Client, payload: MoveMessage) => {
      this.moveInputs.set(client.sessionId, { dx: clampAxis(payload?.dx), dy: clampAxis(payload?.dy) });
    },
    interact: (client: Client) => {
      this.handleInteract(client);
    },
    buy_decoration: (client: Client, payload: { kind: string; x: number; y: number }) => {
      this.handleBuyDecoration(client, payload);
    },
  };

  async onCreate() {
    // Short shareable room code; private so it can only be joined by code (joinById).
    this.roomId = await this.generateRoomCode();
    this.setPrivate(true);

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

  onJoin(client: Client) {
    const usedColors = new Set([...this.state.players.values()].map((p) => p.colorIndex));
    const colorIndex = usedColors.has(0) ? 1 : 0;
    const spawn = SPAWN_POINTS[colorIndex];

    const player = new Player();
    player.x = spawn.x;
    player.y = spawn.y;
    player.colorIndex = colorIndex;
    this.state.players.set(client.sessionId, player);
    this.moveInputs.set(client.sessionId, { dx: 0, dy: 0 });
    console.log(`[BobaShopRoom] ${client.sessionId} joined (${this.clients.length}/${this.maxClients})`);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.moveInputs.delete(client.sessionId);
    console.log(`[BobaShopRoom] ${client.sessionId} left`);
  }

  async onDispose() {
    await this.presence.srem(ROOM_CODES_CHANNEL, this.roomId);
  }

  /** Generate a code not used by any other live room, and register it via the Presence API. */
  private async generateRoomCode(): Promise<string> {
    const used = new Set(await this.presence.smembers(ROOM_CODES_CHANNEL));
    let code: string;
    do {
      code = "";
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
        code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
      }
    } while (used.has(code));
    await this.presence.sadd(ROOM_CODES_CHANNEL, code);
    return code;
  }

  private update(dt: number) {
    // Movement
    this.state.players.forEach((player, sessionId) => {
      const input = this.moveInputs.get(sessionId);
      if (!input || (input.dx === 0 && input.dy === 0)) return;
      const next = stepMovement(player, input.dx, input.dy, dt);
      player.x = next.x;
      player.y = next.y;
      player.direction = directionFromInput(input.dx, input.dy, player.direction as Direction);
    });

    // Tea dispenser fills a cup placed on it over time.
    this.state.stations.forEach((station) => {
      if (station.type === StationType.TeaDispenser && station.item === Item.Cup) {
        station.progress = Math.min(1, station.progress + dt / TEA_FILL_SECONDS);
        if (station.progress >= 1) station.item = Item.CupTea;
      }
    });

    // Delivered drinks disappear from the counter after a short delay.
    for (const [stationId, remaining] of this.deliveryTimers) {
      const left = remaining - dt;
      if (left > 0) {
        this.deliveryTimers.set(stationId, left);
        continue;
      }
      const station = this.state.stations.get(stationId);
      if (station) {
        station.item = Item.None;
        station.progress = 0;
      }
      this.deliveryTimers.delete(stationId);
    }
  }

  private findNearestStation(player: Player): Station | undefined {
    let best: Station | undefined;
    let bestDist = Infinity;
    for (const def of STATIONS) {
      const d = distanceToStation(player, def);
      if (d <= INTERACT_RANGE && d < bestDist) {
        bestDist = d;
        best = this.state.stations.get(def.id);
      }
    }
    return best;
  }

  private handleInteract(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const fail = (reason: string) => client.send(ServerEvents.InteractFailed, { reason });
    const station = this.findNearestStation(player);
    if (!station) return fail("Không có quầy nào gần đây");

    const held = player.heldItem;

    switch (station.type) {
      case StationType.CupShelf: {
        if (held !== Item.None) return fail("Tay đang cầm đồ rồi");
        player.heldItem = Item.Cup;
        return;
      }

      case StationType.TeaDispenser: {
        // Place an empty cup to start filling, or pick up the filled cup.
        if (held === Item.Cup && station.item === Item.None) {
          station.item = Item.Cup;
          station.progress = 0;
          player.heldItem = Item.None;
          return;
        }
        if (held === Item.None && station.item === Item.CupTea) {
          player.heldItem = Item.CupTea;
          station.item = Item.None;
          station.progress = 0;
          return;
        }
        if (held === Item.None && station.item === Item.Cup) return fail("Trà đang chảy, chờ chút...");
        return fail("Cần ly rỗng để hứng trà");
      }

      case StationType.PearlPot: {
        if (held !== Item.CupTea) return fail("Cần ly trà để thêm trân châu");
        player.heldItem = Item.CupTeaPearl;
        return;
      }

      case StationType.DeliveryCounter: {
        if (held !== Item.CupTeaPearl) return fail("Cần ly trà sữa trân châu hoàn chỉnh");
        if (station.item !== Item.None) return fail("Quầy đang bận, chờ chút");
        player.heldItem = Item.None;
        station.item = Item.CupTeaPearl;
        this.state.money += DRINK_PRICE;
        this.deliveryTimers.set(station.id, DELIVERY_CLEAR_SECONDS);
        this.broadcast(ServerEvents.Delivered, { by: client.sessionId, amount: DRINK_PRICE });
        return;
      }
    }
  }

  private handleBuyDecoration(client: Client, payload: { kind: string; x: number; y: number }) {
    const def = DECORATION_CATALOG.find((d) => d.kind === payload?.kind);
    if (!def) return;
    const x = Number(payload.x);
    const y = Number(payload.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (this.state.money < def.price) {
      client.send(ServerEvents.InteractFailed, { reason: "Không đủ tiền (cần $" + def.price + ")" });
      return;
    }

    this.state.money -= def.price;
    const deco = new Decoration();
    deco.id = "deco_" + ++this.decorationSeq;
    deco.kind = def.kind;
    deco.x = Math.max(0, Math.min(WORLD_WIDTH, x));
    deco.y = Math.max(0, Math.min(WORLD_HEIGHT, y));
    this.state.decorations.push(deco);
  }
}
