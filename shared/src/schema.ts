import { ArraySchema, MapSchema, Schema, type } from "@colyseus/schema";

export class Player extends Schema {
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("string") direction: string = "down"; // "up" | "down" | "left" | "right"
  @type("string") heldItem: string = ""; // see Item enum in @boba/shared
  @type("number") colorIndex: number = 0;
}

export class Station extends Schema {
  @type("string") id: string = "";
  @type("string") type: string = ""; // see StationType enum in @boba/shared
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("string") item: string = ""; // item currently placed on this station
  @type("number") progress: number = 0; // 0..1, e.g. tea filling progress
}

export class Decoration extends Schema {
  @type("string") id: string = "";
  @type("string") kind: string = "";
  @type("number") x: number = 0;
  @type("number") y: number = 0;
}

export class BobaShopState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: Station }) stations = new MapSchema<Station>();
  @type("number") money: number = 0;
  @type([Decoration]) decorations = new ArraySchema<Decoration>();
}
