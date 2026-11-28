import { Callbacks, type Room } from "@colyseus/sdk";
import { Messages, ServerEvents, usernameKey, type InviteResultEvent, type OnlinePlayer } from "@boba/shared";
import type { BobaShopState } from "@boba/shared/schema";

// The host's invite panel (shown in the modal): everyone online right now, minus the host and whoever
// already has a seat in this room, one "Mời" button each. The result of each invite
// (ServerEvents.InviteResult, sent back by the game room) is reported on its row and kept across
// list refreshes, so "Đã mời" survives presence joins/leaves.

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = "") =>
  Object.assign(document.createElement(tag), { className, textContent: text });

/** Last known result of inviting one player (key = username key). */
interface InviteStatus {
  ok: boolean;
  text: string;
}

export class InvitePanel {
  readonly root = el("div", "invite-panel");
  private readonly list = el("ul", "invite-list");
  private readonly empty = el("p", "invite-empty", "Chưa có ai khác đang online.");
  private players: OnlinePlayer[] = [];
  private readonly statuses = new Map<string, InviteStatus>();
  private readonly off: Array<() => void> = [];

  constructor(
    private readonly room: Room<BobaShopState>,
    private readonly me: string,
    players: OnlinePlayer[],
  ) {
    this.list.id = "invite-list";
    const hint = el("p", "invite-hint", "Người đang online (trừ bạn và người đã ở trong phòng):");
    this.root.append(hint, this.list, this.empty);
    const $state = Callbacks.get(room);
    // An invitee accepting drops out of the list (they now have a seat here).
    this.off.push(
      $state.onAdd("players", () => this.render()),
      $state.onRemove("players", () => this.render()),
      room.onMessage(ServerEvents.InviteResult, (result: InviteResultEvent) => {
        const status: InviteStatus = { ok: result.ok, text: result.ok ? "Đã mời ✓" : result.reason ?? "Không mời được" };
        this.statuses.set(usernameKey(result.target), status);
        this.render();
      }),
    );
    this.update(players);
  }

  /** Fresh online list from the presence room: re-render the rows. */
  update(players: OnlinePlayer[]) {
    this.players = players;
    this.render();
  }

  destroy() {
    for (const unbind of this.off) unbind();
    this.off.length = 0;
  }

  private render() {
    const myKey = usernameKey(this.me);
    const seated = new Set<string>();
    this.room.state.players.forEach((p) => seated.add(usernameKey(p.name)));
    const invitees = this.players.filter((p) => {
      const key = usernameKey(p.name);
      return key !== myKey && !seated.has(key);
    });
    this.list.replaceChildren(
      ...invitees.map((p) => {
        const row = el("li", "invite-row");
        const who = el("span", "invite-name", p.name);
        if (p.roomId) who.title = "Đang ở phòng khác";
        const status = el("span", "invite-status");
        const known = this.statuses.get(usernameKey(p.name));
        if (known) {
          status.textContent = known.text;
          status.classList.toggle("error", !known.ok);
        }
        const btn = el("button", "btn small primary", "Mời");
        btn.type = "button";
        btn.addEventListener("click", () => this.room.send(Messages.InvitePlayer, { target: p.name }));
        row.append(who, status, btn);
        return row;
      }),
    );
    this.empty.hidden = invitees.length > 0;
  }
}
