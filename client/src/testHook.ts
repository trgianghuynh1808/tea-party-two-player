import type { Room } from "@colyseus/sdk";
import { Messages } from "@boba/shared";
import type { BobaShopState } from "@boba/shared/schema";

/** URL param that turns on the e2e test hook (`?test=1`). */
export const TEST_MODE_PARAM = "test";

/**
 * The slice of ShopScene the hook reads. Structural on purpose: testHook does not import the scene,
 * main.ts owns the Phaser game and passes in the accessor.
 */
type StationLabelScene = { stationLabelTexts(): string[] };

/**
 * Minimal hook for e2e tests, exposed as `window.__GAME__` when `?test=1` is set.
 * Future test tasks only add fields/methods to this same object.
 */
export type GameTestHook = {
  /** The joined room. */
  room: Room<BobaShopState>;
  /** Send a client -> server message: the type is a `Messages.*` value from @boba/shared. */
  send(type: (typeof Messages)[keyof typeof Messages], payload?: unknown): void;
  /** Live room state (the same object as `room.state`). */
  state: BobaShopState;
  /** The yard's buildings as a plain object: tileKey(cx, cy) -> tile kind. */
  tiles(): Record<string, string>;
  /** Facings of the yard's props as a plain object: structure tileKey -> rotation index. */
  tileRotations(): Record<string, number>;
  /** Label text of every station currently showing one; [] until the scene has booted. */
  stationLabels(): string[];
};

declare global {
  interface Window {
    __GAME__?: GameTestHook;
  }
}

// Evaluated once at page load: the URL is rewritten later (?room=...), so it must not be re-read.
export const isTestMode = new URLSearchParams(location.search).get(TEST_MODE_PARAM) === "1";

/** Assign `window.__GAME__` so e2e tests can drive the game; a no-op outside test mode. */
export function installTestHook(room: Room<BobaShopState>, getShopScene: () => StationLabelScene | undefined): void {
  if (!isTestMode) return;
  window.__GAME__ = {
    room,
    send: (type, payload) => room.send(type, payload),
    state: room.state,
    tiles: () => Object.fromEntries(room.state.tiles ?? []),
    tileRotations: () => Object.fromEntries(room.state.tileRotations ?? []),
    stationLabels: () => getShopScene()?.stationLabelTexts() ?? [],
  };
}
