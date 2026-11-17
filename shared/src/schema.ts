import { ArraySchema, MapSchema, Schema, type } from "@colyseus/schema";

export class Player extends Schema {
  /** Username picked in the lobby (unique among connected players). */
  @type("string") name: string = "";
  /** false while the player's connection is lost (their seat is kept for a while, see RECONNECT_GRACE_SECONDS). */
  @type("boolean") online: boolean = true;
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("string") direction: string = "down"; // "up" | "down" | "left" | "right"
  @type("string") heldItem: string = ""; // "" | "cup" | "cup:black_tea,milk" (see makeCup)
  @type("number") colorIndex: number = 0;
  @type("string") gender: string = "male"; // "male" | "female" (see Gender in @boba/shared)
  @type("string") character: string = "male"; // CharacterDef.id (see CHARACTERS in @boba/shared)
  /** This player's own wallet (saved per username, carried across rooms). */
  @type("number") money: number = 0;
  /** true = opened this room: the shop uses their furniture and only they can decorate. */
  @type("boolean") host: boolean = false;
  /** What this player got (or lost) from the last shift's split earnings. */
  @type("number") shiftShare: number = 0;
  /** Bumped when the server moves the player itself (spawn, shift start, rejected move): the client must snap. */
  @type("number") teleportSeq: number = 0;
}

export class Station extends Schema {
  @type("string") id: string = "";
  @type("string") type: string = ""; // see StationType enum in @boba/shared
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("string") item: string = ""; // item currently placed on this station (see makeCup)
  @type("number") progress: number = 0; // 0..1 while a machine processes; 1 = ready to pick up
  /** Timed machines: 0..1 once the cup is ready; the cup spills when it reaches 1 (see MACHINE_OVERFLOW_SECONDS). */
  @type("number") overflow: number = 0;
}

export class Decoration extends Schema {
  @type("string") id: string = "";
  @type("string") kind: string = "";
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  /** 0..3, meaning depends on the catalog item's rotation mode (see DecorationRotation). */
  @type("number") rotation: number = 0;
}

export class Order extends Schema {
  @type("string") id: string = "";
  @type("string") kind: string = "normal"; // see CustomerKind in @boba/shared
  @type("string") drinks: string = ""; // comma-separated drink ids (see DRINKS / orderDrinkIds)
  @type("number") servedMask: number = 0; // bit i set = drink i already delivered
  @type("number") timeLeft: number = 0; // seconds
  @type("number") duration: number = 0; // seconds
  /** Table (decoration id) the customers sit at; "" = take-away, served at the delivery counter. */
  @type("string") tableId: string = "";
  /** Comma-separated seat (decoration) ids: customer i sits on seat i and ordered drink i. */
  @type("string") seats: string = "";
  /** Comma-separated character ids: how each customer looks (picked by the server so everyone sees the same). */
  @type("string") looks: string = "";
}

export class BobaShopState extends Schema {
  /** Room title shown in the lobby and the side panel. */
  @type("string") roomName: string = "";
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: Station }) stations = new MapSchema<Station>();
  /** Username of whoever opened the room: the furniture shown is theirs. */
  @type("string") hostName: string = "";
  @type([Decoration]) decorations = new ArraySchema<Decoration>();
  @type([Order]) orders = new ArraySchema<Order>();
  /** The host's buildings in the yard: tileKey(cx, cy) -> tile kind (see BUILD_TILES). */
  @type({ map: "string" }) tiles = new MapSchema<string>();

  // Shift (round) state
  @type("string") phase: string = "waiting"; // see GamePhase in @boba/shared
  @type("number") shiftTimeLeft: number = 0; // seconds
  @type("number") shiftEarnings: number = 0;
  @type("number") servedCount: number = 0;
  @type("number") missedCount: number = 0;
  /** Orders completed in a row without a customer walking out. */
  @type("number") combo: number = 0;
  @type("number") bestCombo: number = 0;
}
