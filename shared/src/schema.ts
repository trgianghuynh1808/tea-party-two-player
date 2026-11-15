import { ArraySchema, MapSchema, Schema, type } from "@colyseus/schema";

export class Player extends Schema {
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("string") direction: string = "down"; // "up" | "down" | "left" | "right"
  @type("string") heldItem: string = ""; // "" | "cup" | "cup:black_tea,milk" (see makeCup)
  @type("number") colorIndex: number = 0;
  @type("string") gender: string = "male"; // "male" | "female" (see Gender in @boba/shared)
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
}

export class Decoration extends Schema {
  @type("string") id: string = "";
  @type("string") kind: string = "";
  @type("number") x: number = 0;
  @type("number") y: number = 0;
}

export class Order extends Schema {
  @type("string") id: string = "";
  @type("string") drinkId: string = ""; // see DRINKS in @boba/shared
  @type("number") timeLeft: number = 0; // seconds
  @type("number") duration: number = 0; // seconds
}

export class BobaShopState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: Station }) stations = new MapSchema<Station>();
  @type("number") money: number = 0;
  @type([Decoration]) decorations = new ArraySchema<Decoration>();
  @type([Order]) orders = new ArraySchema<Order>();

  // Shift (round) state
  @type("string") phase: string = "waiting"; // see GamePhase in @boba/shared
  @type("number") shiftTimeLeft: number = 0; // seconds
  @type("number") shiftEarnings: number = 0;
  @type("number") servedCount: number = 0;
  @type("number") missedCount: number = 0;
}
