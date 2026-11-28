// Lobby: usernames, room list and join rules shared by server (validation) and client (forms, messages).
//
// - Players pick a username (no password). Coming back with the same name takes over your player again
//   (position, held cup), e.g. after closing the tab by accident.
// - Each username has its own shop save (money + furniture). Anyone can open a room (max MAX_PLAYERS players):
//   the room shows the furniture of whoever opened it, and only they can decorate it.
// - Earnings of a shift are split equally between the players in the room when the shift ends.
// - A dropped player keeps their seat for RECONNECT_GRACE_SECONDS; a room with nobody left is removed.

/** Players per room. */
export const MAX_PLAYERS = 2;

/** How often the lobby refreshes the room list. */
export const ROOMS_POLL_MS = 1000;

/** How long a player who lost connection (closed tab, network) keeps their seat and character. */
export const RECONNECT_GRACE_SECONDS = 120;

/** HTTP endpoint for the lobby: rooms currently open. */
export const ROOMS_PATH = "/rooms";

export interface RoomPlayerInfo {
  name: string;
  /** false = lost connection, seat kept for a while (see RECONNECT_GRACE_SECONDS). */
  online: boolean;
}

export interface RoomInfo {
  id: string;
  name: string;
  players: RoomPlayerInfo[];
  maxPlayers: number;
  /** When the room was opened (ms since epoch, server clock). */
  createdAt: number;
}

export interface RoomsResponse {
  /** Newest room first. */
  rooms: RoomInfo[];
  /** Server time of this response (ms since epoch): "x minutes ago" doesn't depend on the player's clock. */
  now: number;
}

/** Room metadata kept up to date by the server (listed by ROOMS_PATH). */
export interface RoomMetadata {
  name: string;
  players: RoomPlayerInfo[];
}

/** Options sent with client.create() / client.joinById(). */
export interface JoinOptions {
  username: string;
  /** Random id remembered by the browser: the same name from the same browser may replace a stale tab. */
  deviceId: string;
  character?: string;
  gender?: string;
  /** create() only. */
  roomName?: string;
  /**
   * One-time invite token (see ServerEvents.Invite): required to join someone else's room,
   * skipped for the host or a player who still has a seat in the room.
   */
  inviteToken?: string;
}

/** Matchmaking errors (thrown by the room, shown in the lobby). */
export const JoinError = {
  BAD_NAME: 4211,
  NAME_TAKEN: 4212,
  ROOM_FULL: 4213,
  SHOP_UNAVAILABLE: 4214,
  /** Joining a private room without a valid invite token. */
  NOT_INVITED: 4215,
} as const;

/** Who is online right now (broadcast by the presence room, see ServerEvents.Online). */
export interface OnlinePlayer {
  name: string;
  /** Room id the player is currently playing in, if any. */
  roomId?: string;
}

/** ServerEvents.Invite: an invite pushed to the target player through the presence room. */
export interface InvitePayload {
  /** Inviter's name (the host). */
  from: string;
  /** Room to join when the invite is accepted. */
  roomId: string;
  /** Room title shown in the invite popup. */
  roomName: string;
  /** One-time token to pass back as JoinOptions.inviteToken. */
  token: string;
}

/** Close code sent to a tab whose player was taken over (same name joined again elsewhere). */
export const REPLACED_CLOSE_CODE = 4220;

export const USERNAME_MIN = 2;
export const USERNAME_MAX = 16;
export const ROOM_TITLE_MAX = 24;

/** Letters (any language, incl. Vietnamese), digits, spaces and _ . - */
const USERNAME_RE = /^[\p{L}\p{M}\p{N} _.-]+$/u;

const tidy = (raw: unknown) => (typeof raw === "string" ? raw.normalize("NFC").replace(/\s+/g, " ").trim() : "");

/** Cleaned-up username, or undefined if it isn't allowed. */
export function normalizeUsername(raw: unknown): string | undefined {
  const name = tidy(raw);
  const length = [...name].length;
  return length >= USERNAME_MIN && length <= USERNAME_MAX && USERNAME_RE.test(name) ? name : undefined;
}

/** Usernames are unique ignoring case ("Giang" = "giang"). */
export const usernameKey = (name: string) => name.toLocaleLowerCase("vi");

/** Cleaned-up room title (control characters dropped), or the fallback when empty. */
export function normalizeRoomTitle(raw: unknown, fallback: string): string {
  const title = [...tidy(raw).replace(/\p{C}/gu, "")].slice(0, ROOM_TITLE_MAX).join("");
  return title || fallback;
}
