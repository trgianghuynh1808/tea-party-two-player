import Phaser from "phaser";
import type { Room } from "@colyseus/sdk";
import {
  CustomerKind,
  ORDER_DANGER_RATIO,
  RESTAURANT,
  WORLD_HEIGHT,
  areaOf,
  directionFromInput,
  footprintBox,
  getCustomer,
  getMenuItem,
  isDrinkServed,
  orderDrinkIds,
  servedItemFor,
  type CharacterDef,
  type PlacedDecoration,
} from "@boba/shared";
import type { BobaShopState, Order } from "@boba/shared/schema";
import { CupView } from "./CupView";
import { CHARACTER_BODY_PX, DIRECTION_ROW, WALK_COLUMNS, WALK_FPS, characterKey, characterOf } from "./characterArt";

/** Customers are a bit smaller than the players so the two are easy to tell apart. */
const CUSTOMER_SCALE = 0.9;
const BODY_PX = CHARACTER_BODY_PX * CUSTOMER_SCALE;
/** Customers come in from (and leave through) the bottom edge of the room their table is in. */
const doorY = (seat: { x: number; y: number }) =>
  (areaOf(seat) === "restaurant" ? RESTAURANT.y + RESTAURANT.height : WORLD_HEIGHT) + BODY_PX;
const WALK_SPEED = 130; // px per second
/** Seated: feet this far above the bottom of the seat's footprint, so they look sat on it. */
const SEAT_LIFT = 10;
/** Served customers enjoy their drink a moment before leaving. */
const LEAVE_DELAY_MS = 1200;
/** Joining while an order is already this old (seconds): its customers are shown seated straight away. */
const ALREADY_SEATED_AFTER = 3;
const TABLE_CUP_HEIGHT = 20;
const BUBBLE_CUP_HEIGHT = 22;
const PATIENCE_BAR_WIDTH = 28;

interface Customer {
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Sprite;
  character: CharacterDef;
  /** Speech bubble with the ordered drink and a patience bar, shown once seated until served. */
  bubble: Phaser.GameObjects.Container;
  patienceBar: Phaser.GameObjects.Rectangle;
  /** The served drink, standing on the table in front of the customer. */
  tableCup: CupView;
  drinkItem: string;
  direction: string;
  /** Facing (towards the table) and drawing depth once seated. */
  seatDirection: string;
  seatDepth: number;
  walking: boolean;
  walkPhase: number;
  seated: boolean;
  tween?: Phaser.Tweens.Tween;
}

interface Party {
  order: Order;
  customers: Customer[];
  /** Every drink delivered (told by the Delivered event). */
  served?: boolean;
}

/**
 * Seated customers (orders with a table): they walk in, sit on their seat facing the table, show what they
 * ordered, get their drink put on the table, and walk out when served (or when they run out of patience).
 * Purely visual: seats, tables and timers come from the synced orders.
 */
export class CustomerController {
  private parties = new Map<string, Party>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly room: Room<BobaShopState>,
  ) {}

  addOrder(order: Order) {
    if (!order.tableId || this.parties.has(order.id)) return;
    const table = this.decoration(order.tableId);
    if (!table) return;
    const drinks = orderDrinkIds(order.drinks);
    const looks = order.looks ? order.looks.split(",") : [];
    const seated = order.duration - order.timeLeft > ALREADY_SEATED_AFTER;
    const customers: Customer[] = [];

    order.seats.split(",").forEach((seatId, i) => {
      const seat = this.decoration(seatId);
      const seatBox = seat && footprintBox(seat);
      const drink = getMenuItem(drinks[i]);
      if (!seat || !seatBox || !drink) return;
      // Kind badge (VIP, picky, group) on the first customer of the party.
      const badge = i === 0 && order.kind !== CustomerKind.Normal ? getCustomer(order.kind).icon : "";
      const customer = this.createCustomer(characterOf(looks[i] ?? ""), servedItemFor(drink.id), badge);
      customers.push(customer);

      const seatX = seat.x;
      const seatY = seatBox.bottom - SEAT_LIFT;
      // Face the table. Sitting behind the chair's backrest (facing up), the chair is drawn over the customer.
      customer.seatDirection = directionFromInput(table.x - seat.x, table.y - seat.y, "down");
      customer.seatDepth = seat.y + (customer.seatDirection === "up" ? -1 : 1);

      // The served cup stands on the table top, on the customer's side.
      const offsetX = Phaser.Math.Clamp(seat.x - table.x, -14, 14);
      const offsetY = Phaser.Math.Clamp((seat.y - table.y) * 0.2, -4, 4);
      customer.tableCup.setPosition(table.x + offsetX, table.y - 16 + offsetY).setDepth(Math.max(table.y, customer.seatDepth) + 0.5);

      if (seated) {
        customer.container.setPosition(seatX, seatY);
        this.sitDown(customer);
      } else {
        customer.container.setPosition(seatX, doorY(seat));
        this.walkTo(customer, seatX, seatY, "up", () => this.sitDown(customer));
      }
    });

    this.parties.set(order.id, { order, customers });
    this.syncServed(order.id);
  }

  /** A drink was delivered: that customer's bubble goes away and the cup appears on the table. */
  syncServed(orderId: string) {
    const party = this.parties.get(orderId);
    if (!party) return;
    party.customers.forEach((c, i) => {
      const served = isDrinkServed(party.order.servedMask, i);
      c.tableCup.setItem(served ? c.drinkItem : "");
      c.bubble.setVisible(c.seated && !served);
    });
  }

  /** The whole order was delivered: every drink is on the table. */
  markServed(orderId: string) {
    const party = this.parties.get(orderId);
    if (!party) return;
    party.served = true;
    for (const c of party.customers) {
      c.tableCup.setItem(c.drinkItem);
      c.bubble.setVisible(false);
    }
  }

  /**
   * The order is over and the customers leave: happy if served before the timer bar turned red,
   * angry if served late (red bar) or not served at all.
   */
  removeOrder(orderId: string) {
    const party = this.parties.get(orderId);
    if (!party) return;
    this.parties.delete(orderId);
    const { order } = party;
    const served = party.served || orderDrinkIds(order.drinks).every((_, i) => isDrinkServed(order.servedMask, i));
    const ratio = order.duration > 0 ? order.timeLeft / order.duration : 0;
    const happy = served && ratio > ORDER_DANGER_RATIO;

    for (const c of party.customers) {
      c.bubble.setVisible(false);
      const mood = this.scene.add
        .text(0, -BODY_PX - 14, happy ? "💕" : "😠", { fontFamily: "sans-serif", fontSize: "18px" })
        .setOrigin(0.5);
      c.container.add(mood);
      this.scene.time.delayedCall(served ? LEAVE_DELAY_MS : 300, () => {
        if (!c.container.active) return;
        c.tableCup.setItem("");
        mood.destroy();
        this.walkTo(c, c.container.x, doorY(c.container), "down", () => this.destroyCustomer(c));
      });
    }
  }

  update(dt: number) {
    for (const party of this.parties.values()) {
      const { order } = party;
      const ratio = order.duration > 0 ? Math.max(0, order.timeLeft / order.duration) : 0;
      for (const c of party.customers) {
        c.patienceBar.width = PATIENCE_BAR_WIDTH * ratio;
        c.patienceBar.setFillStyle(ratio > 0.5 ? 0x2a9d8f : ratio > ORDER_DANGER_RATIO ? 0xf4a261 : 0xe63946);
      }
    }
    for (const party of this.parties.values()) for (const c of party.customers) this.animate(c, dt);
    for (const c of this.leaving) this.animate(c, dt);
  }

  destroy() {
    for (const party of this.parties.values()) party.customers.forEach((c) => this.destroyCustomer(c));
    for (const c of [...this.leaving]) this.destroyCustomer(c);
    this.parties.clear();
  }

  // ---------------------------------------------------------------- Internals

  /** Customers walking out after their order ended (no longer in `parties`). */
  private leaving = new Set<Customer>();

  private decoration(id: string): PlacedDecoration | undefined {
    return this.room.state.decorations?.find((d) => d.id === id);
  }

  private createCustomer(character: CharacterDef, drinkItem: string, badge: string): Customer {
    const scene = this.scene;
    const sprite = scene.add
      .sprite(0, 0, characterKey(character.id), character.standColumn)
      .setOrigin(0.5, character.feetRow / character.frameHeight)
      .setScale(BODY_PX / character.bodyHeight);

    // Bubble: white card with the ordered drink, a small tail pointing at the head, patience bar underneath.
    const bubbleY = -BODY_PX - 12;
    const bg = scene.add.graphics();
    bg.fillStyle(0xffffff, 0.95).lineStyle(1.5, 0x3d2c29, 0.6);
    bg.fillRoundedRect(-21, -36, 42, 36, 7).strokeRoundedRect(-21, -36, 42, 36, 7);
    bg.fillTriangle(-5, -1, 5, -1, 0, 6);
    const cup = new CupView(scene, 0, -6, BUBBLE_CUP_HEIGHT);
    cup.setItem(drinkItem);
    const barBack = scene.add.rectangle(-PATIENCE_BAR_WIDTH / 2, -40, PATIENCE_BAR_WIDTH, 4, 0x3d2c29, 0.25).setOrigin(0, 0.5);
    const patienceBar = scene.add.rectangle(-PATIENCE_BAR_WIDTH / 2, -40, PATIENCE_BAR_WIDTH, 4, 0x2a9d8f).setOrigin(0, 0.5);
    const bubbleParts: Phaser.GameObjects.GameObject[] = [bg, cup, barBack, patienceBar];
    if (badge) bubbleParts.push(scene.add.text(23, -34, badge, { fontFamily: "sans-serif", fontSize: "14px" }).setOrigin(0, 0));
    const bubble = scene.add.container(0, bubbleY, bubbleParts).setVisible(false);

    const container = scene.add.container(0, 0, [sprite, bubble]).setAlpha(0);
    scene.tweens.add({ targets: container, alpha: 1, duration: 250 });
    const tableCup = new CupView(scene, 0, 0, TABLE_CUP_HEIGHT);

    return {
      container,
      sprite,
      character,
      bubble,
      patienceBar,
      tableCup,
      drinkItem,
      direction: "up",
      seatDirection: "down",
      seatDepth: 0,
      walking: false,
      walkPhase: 0,
      seated: false,
    };
  }

  private walkTo(c: Customer, x: number, y: number, direction: string, onDone: () => void) {
    c.tween?.stop();
    c.seated = false;
    c.walking = true;
    c.direction = direction;
    const distance = Math.hypot(x - c.container.x, y - c.container.y);
    if (direction === "down") this.leaving.add(c);
    c.tween = this.scene.tweens.add({
      targets: c.container,
      x,
      y,
      duration: (distance / WALK_SPEED) * 1000,
      onComplete: () => {
        c.walking = false;
        onDone();
      },
    });
  }

  private sitDown(c: Customer) {
    c.seated = true;
    c.walking = false;
    c.direction = c.seatDirection;
    c.container.setDepth(c.seatDepth);
    this.setFrame(c, c.character.standColumn);
    c.sprite.y = 0;
    // Show the bubble unless the drink already came while walking in.
    const party = [...this.parties.values()].find((p) => p.customers.includes(c));
    const index = party ? party.customers.indexOf(c) : -1;
    c.bubble.setVisible(!!party && !isDrinkServed(party.order.servedMask, index));
  }

  private animate(c: Customer, dt: number) {
    if (!c.walking) return;
    c.container.setDepth(c.container.y);
    c.walkPhase += dt;
    if (c.character.columns > 1) {
      this.setFrame(c, WALK_COLUMNS[Math.floor(c.walkPhase * WALK_FPS) % WALK_COLUMNS.length]);
    } else {
      this.setFrame(c, c.character.standColumn);
      c.sprite.y = -Math.abs(Math.sin(c.walkPhase * 14)) * 4;
    }
  }

  private setFrame(c: Customer, column: number) {
    c.sprite.setFrame((DIRECTION_ROW[c.direction] ?? DIRECTION_ROW.down) * c.character.columns + column);
  }

  private destroyCustomer(c: Customer) {
    c.tween?.stop();
    this.leaving.delete(c);
    c.tableCup.destroy();
    c.container.destroy();
  }
}
