import type { InvitePayload } from "@boba/shared";

// Popup for an invite pushed through the presence room (ServerEvents.Invite): a fixed overlay over
// both the lobby and the game with Đồng ý / Từ chối. A newer invite replaces the one being shown;
// Từ chối just closes it (the invitee's join never happens).

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = "") =>
  Object.assign(document.createElement(tag), { className, textContent: text });

export class InvitePopup {
  private readonly body = el("p", "invite-popup-text");
  private payload?: InvitePayload;

  constructor(
    private readonly root: HTMLElement,
    private readonly onAccept: (payload: InvitePayload) => void,
    private readonly onDecline: () => void,
  ) {
    const card = el("div", "invite-popup-card");
    const title = el("h2", "", "🤝 Lời mời vào phòng");
    const accept = el("button", "btn primary", "Đồng ý");
    accept.id = "invite-accept";
    accept.type = "button";
    accept.addEventListener("click", () => {
      const payload = this.payload;
      this.hide();
      if (payload) this.onAccept(payload);
    });
    const decline = el("button", "btn", "Từ chối");
    decline.id = "invite-decline";
    decline.type = "button";
    decline.addEventListener("click", () => {
      this.hide();
      this.onDecline();
    });
    const actions = el("div", "invite-popup-actions");
    actions.append(accept, decline);
    card.append(title, this.body, actions);
    root.append(card);
  }

  /** Show (or replace with) an incoming invite. */
  show(payload: InvitePayload) {
    this.payload = payload;
    this.body.replaceChildren(el("strong", "", payload.from), " mời bạn vào phòng ", el("strong", "", payload.roomName), ".");
    this.root.hidden = false;
  }

  hide() {
    this.root.hidden = true;
    this.payload = undefined;
  }
}
