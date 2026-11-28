import { Room, ServerError, type Client } from "colyseus";
import {
  JoinError,
  ServerEvents,
  normalizeUsername,
  usernameKey,
  type InvitePayload,
  type JoinOptions,
  type OnlinePlayer,
} from "@boba/shared";

/**
 * Lightweight room every named client joins (lobby or in-game) so the server knows who is online
 * and can push invites to the right player (see Messages.ListOnline / ServerEvents.Online / Invite).
 * It carries no state: everything is message-driven, and it never disposes when the last client leaves.
 */

/** Validated join request (returned by onAuth, available as client.auth). */
interface PresenceAuth {
  name: string;
  key: string;
}

/** Username key -> newest connection of that player (a new tab replaces an older one of the same name). */
const online = new Map<string, Client>();

/**
 * Which game room each username key currently plays in. The seats map lives in BobaShopRoom's module,
 * which registers its lookup here — so this module must not import it back (that would be an import cycle).
 */
let seatRoomIdOf: (key: string) => string | undefined = () => undefined;

/** BobaShopRoom (owner of the seats map) registers its key -> room id lookup here. */
export function registerSeatLookup(lookup: (key: string) => string | undefined) {
  seatRoomIdOf = lookup;
}

/** Push an invite to the online player with this username key. Returns false when they aren't online. */
export function sendInvite(targetKey: string, payload: InvitePayload): boolean {
  const client = online.get(targetKey);
  if (!client) return false;
  client.send(ServerEvents.Invite, payload);
  return true;
}

/** Everyone online right now, with the game room they play in when known. */
export function onlineNames(): OnlinePlayer[] {
  return [...online.entries()].map(([key, client]) => ({
    name: (client.auth as PresenceAuth).name,
    roomId: seatRoomIdOf(key),
  }));
}

export class PresenceRoom extends Room {
  /** One shared room for everyone: it outlives its clients and is never recreated empty. */
  autoDispose = false;
  maxClients = 1000;

  /** Only a valid username is needed — several tabs of the same player may connect at once. */
  onAuth(_client: Client, options: Partial<JoinOptions> = {}): PresenceAuth {
    const name = normalizeUsername(options.username);
    if (!name) throw new ServerError(JoinError.BAD_NAME, "Tên không hợp lệ");
    return { name, key: usernameKey(name) };
  }

  onJoin(client: Client) {
    const { key } = client.auth as PresenceAuth;
    online.set(key, client); // a newer tab of the same player replaces their older connection
    this.broadcastOnline();
  }

  onLeave(client: Client) {
    const { key } = client.auth as PresenceAuth;
    // An older (replaced) tab leaving must not drop the newer connection's entry.
    if (online.get(key) === client) online.delete(key);
    this.broadcastOnline();
  }

  messages = {
    /** Ask for the current online list (it is also broadcast on every join / leave). */
    list_online: (client: Client) => {
      client.send(ServerEvents.Online, onlineNames());
    },
  };

  private broadcastOnline() {
    this.broadcast(ServerEvents.Online, onlineNames());
  }
}
