import "./style.css";
import Phaser from "phaser";
import { Callbacks, Client, CloseCode, ErrorCode, type Room } from "@colyseus/sdk";
import {
  GamePhase,
  JoinError,
  MAX_PLAYERS,
  REPLACED_CLOSE_CODE,
  ROOMS_PATH,
  ROOMS_POLL_MS,
  ROOM_NAME,
  ROOM_TITLE_MAX,
  SERVER_PORT,
  USERNAME_MAX,
  USERNAME_MIN,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  charactersOf,
  defaultCharacterOf,
  getCharacter,
  isGender,
  normalizeUsername,
  usernameKey,
  type CharacterDef,
  type Gender,
  type JoinOptions,
  type RoomInfo,
  type RoomsResponse,
} from "@boba/shared";
import type { BobaShopState } from "@boba/shared/schema";
import { FORCE_TOUCH_PARAM, isTouchDevice } from "./input/TouchControls";
import { AREA_EVENT, BUILD_MODE_EVENT, BUILD_TOOL_EVENT, DECORATE_MODE_EVENT, ShopScene, type ShopSceneData } from "./scenes/ShopScene";
import { BuildPanel } from "./ui/BuildPanel";
import { initForceLandscape, patchPhaserForRotation } from "./forceLandscape";
import { DECOR_ROTATE, DecorPanel, PALETTE_DRAG_START } from "./ui/DecorPanel";
import { OrdersPanel, buildMenu } from "./ui/OrdersPanel";
import { ShiftOverlay } from "./ui/ShiftOverlay";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const lobby = $<HTMLElement>("lobby");
const gameScreen = $<HTMLElement>("game-screen");
const nameForm = $<HTMLFormElement>("name-form");
const usernameInput = $<HTMLInputElement>("username-input");
const lobbyMain = $<HTMLElement>("lobby-main");
const helloName = $<HTMLElement>("hello-name");
const changeNameBtn = $<HTMLButtonElement>("change-name-btn");
const roomList = $<HTMLUListElement>("room-list");
const createForm = $<HTMLFormElement>("create-form");
const roomNameInput = $<HTMLInputElement>("room-name-input");
const createBtn = $<HTMLButtonElement>("create-btn");
const lobbyStatus = $<HTMLParagraphElement>("lobby-status");
const lobbyError = $<HTMLParagraphElement>("lobby-error");
const roomTitle = $<HTMLElement>("room-title");
const playerCountLabel = $<HTMLElement>("player-count");
const copyLinkBtn = $<HTMLButtonElement>("copy-link-btn");
const leaveBtn = $<HTMLButtonElement>("leave-btn");
const menuBtn = $<HTMLButtonElement>("menu-btn");
const decorateBtn = $<HTMLButtonElement>("decorate-btn");
const fullscreenBtn = $<HTMLButtonElement>("fullscreen-btn");
const ordersRoot = $<HTMLElement>("orders-panel");
const decorRoot = $<HTMLElement>("decor-panel");
const buildBtn = $<HTMLButtonElement>("build-btn");
const buildRoot = $<HTMLElement>("build-panel");
const menuInline = $<HTMLElement>("menu-inline");
const shiftOverlayRoot = $<HTMLElement>("shift-overlay");
const modal = $<HTMLElement>("modal");
const modalTitle = $<HTMLElement>("modal-title");
const modalBody = $<HTMLElement>("modal-body");
const modalClose = $<HTMLButtonElement>("modal-close");

// Game server address:
// - VITE_SERVER_URL if set (client hosted separately from the server);
// - dev (Vite on :5173): the Colyseus server on this host at SERVER_PORT;
// - production build: served by the game server itself, so use the same origin.
const endpoint: string =
  import.meta.env.VITE_SERVER_URL ||
  (import.meta.env.DEV ? `${location.protocol}//${location.hostname}:${SERVER_PORT}` : location.origin);
const client = new Client(endpoint);

let game: Phaser.Game | undefined;
let currentRoom: Room<BobaShopState> | undefined;
let ordersPanel: OrdersPanel | undefined;
let shiftOverlay: ShiftOverlay | undefined;
let decorPanel: DecorPanel | undefined;
let decorating = false;
let buildPanel: BuildPanel | undefined;
let building = false;
/** Last build tool picked (the panel is rebuilt for every room). */
let buildTool = "floor_wood";

// Keep the ?touch=1 debug flag across URL rewrites so a refresh still forces touch controls.
const forceTouch = new URLSearchParams(location.search).get(FORCE_TOUCH_PARAM) === "1";
/** Invite links open a room directly: ?room=<roomId> (joined once the player has a name). */
const ROOM_PARAM = "room";
let invitedRoomId = new URLSearchParams(location.search).get(ROOM_PARAM) ?? undefined;

/** Rewrite the URL: ?room=<id> while in a room (a refresh/share lands back in it), plus ?touch=1 if set. */
function setUrl(roomId?: string) {
  const params = new URLSearchParams();
  if (roomId) params.set(ROOM_PARAM, roomId);
  if (forceTouch) params.set(FORCE_TOUCH_PARAM, "1");
  const query = params.toString();
  history.replaceState(null, "", location.pathname + (query ? `?${query}` : ""));
}

// ---------------------------------------------------------------- Username

const USERNAME_KEY = "boba.username";
const DEVICE_KEY = "boba.deviceId";

let username = normalizeUsername(localStorage.getItem(USERNAME_KEY));

/** Random id for this browser: lets the same name from the same browser replace a stale tab. */
const deviceId: string = (() => {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    // crypto.randomUUID needs a secure context (not plain-http LAN): fall back to Math.random.
    id = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
})();

usernameInput.maxLength = USERNAME_MAX;
roomNameInput.maxLength = ROOM_TITLE_MAX;

nameForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = normalizeUsername(usernameInput.value);
  if (!name) {
    lobbyError.textContent = `Tên dài ${USERNAME_MIN}–${USERNAME_MAX} ký tự, chỉ gồm chữ, số, khoảng trắng và _ . -`;
    return;
  }
  username = name;
  localStorage.setItem(USERNAME_KEY, name);
  showLobby();
});

changeNameBtn.addEventListener("click", () => {
  usernameInput.value = username ?? "";
  username = undefined;
  showLobby();
  usernameInput.focus();
});

// ---------------------------------------------------------------- Lobby (room list)

let busy = false;
/** undefined = not loaded yet / server unreachable. */
let rooms: RoomInfo[] | undefined;
/** Server clock minus ours (ms), from the last room list: room ages use the server's time. */
let clockOffset = 0;
let lobbyPollTimer: ReturnType<typeof setTimeout> | undefined;
/** What the room list currently shows: it is only rebuilt when this changes, so a click isn't lost mid-refresh. */
let renderedRoomsKey = "";

const timeFormat = new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" });

/** "14:32 · 5 phút trước" (server clock). */
function describeCreated(createdAt: number): string {
  const minutes = Math.max(0, Math.floor((Date.now() + clockOffset - createdAt) / 60_000));
  const ago =
    minutes < 1 ? "vừa tạo" : minutes < 60 ? `${minutes} phút trước` : `${Math.floor(minutes / 60)} giờ ${minutes % 60} phút trước`;
  return `${timeFormat.format(createdAt)} · ${ago}`;
}

function setBusy(on: boolean) {
  busy = on;
  renderRooms();
}

const isMine = (p: { name: string }) => !!username && usernameKey(p.name) === usernameKey(username);

function renderRooms() {
  createBtn.disabled = busy;
  roomNameInput.placeholder = username ? `Phòng của ${username}` : "Tên phòng";
  if (!rooms) {
    lobbyStatus.textContent = "Đang kết nối server… (lần đầu có thể mất ~1 phút)";
    roomList.replaceChildren();
    renderedRoomsKey = "";
    return;
  }
  lobbyStatus.textContent = rooms.length ? "" : "Chưa có phòng nào, tạo phòng mới nhé!";
  const key = JSON.stringify([busy, username, rooms.map((r) => [r.id, r.name, r.players, describeCreated(r.createdAt)])]);
  if (key === renderedRoomsKey) return;
  renderedRoomsKey = key;
  roomList.replaceChildren(
    ...rooms.map((room) => {
      const li = document.createElement("li");
      li.className = "room-item";
      const mine = room.players.some(isMine);
      const full = !mine && room.players.length >= room.maxPlayers;

      const info = document.createElement("div");
      info.className = "room-info";
      const title = document.createElement("strong");
      title.textContent = room.name;
      const who = document.createElement("span");
      who.className = "room-players";
      who.textContent = room.players.length
        ? room.players.map((p) => `${p.online ? "🟢" : "💤"} ${p.name}`).join("  ")
        : "Trống";
      const created = document.createElement("span");
      created.className = "room-created";
      created.textContent = `🕒 ${describeCreated(room.createdAt)}`;
      info.append(title, who, created);

      const count = document.createElement("span");
      count.className = "room-count";
      count.textContent = `${room.players.length}/${room.maxPlayers}`;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn small" + (mine ? " primary" : "");
      btn.textContent = mine ? "Vào lại" : full ? "Đầy" : "Vào";
      btn.disabled = busy || full;
      btn.addEventListener("click", () => void enter(() => client.joinById<BobaShopState>(room.id, joinOptions())));

      li.classList.toggle("mine", mine);
      li.append(info, count, btn);
      return li;
    }),
  );
}

/** Poll the room list while the lobby is visible (also wakes a sleeping free-tier server). */
async function pollLobby() {
  clearTimeout(lobbyPollTimer);
  if (lobby.hidden || !username) return;
  try {
    const res = await fetch(`${endpoint}${ROOMS_PATH}`, { cache: "no-store" });
    if (res.ok) {
      const body = (await res.json()) as RoomsResponse;
      rooms = body.rooms;
      if (Number.isFinite(body.now)) clockOffset = body.now - Date.now();
    }
  } catch {
    rooms = undefined; // server asleep or unreachable: keep trying
  }
  if (lobby.hidden || !username) return;
  renderRooms();
  lobbyPollTimer = setTimeout(() => void pollLobby(), ROOMS_POLL_MS);
}

/** Show the lobby: the name form first if we don't have a username yet. */
function showLobby(error = "") {
  document.body.classList.remove("in-game");
  closeModal();
  gameScreen.hidden = true;
  lobby.hidden = false;
  lobbyError.textContent = error;
  nameForm.hidden = !!username;
  lobbyMain.hidden = !username;
  if (username) helloName.textContent = username;
  setBusy(false);
  setUrl(invitedRoomId);
  if (!username) {
    clearTimeout(lobbyPollTimer);
    return;
  }
  void pollLobby();
  // Opened from an invite link (or refreshed while in a room): join that room once.
  const roomId = invitedRoomId;
  invitedRoomId = undefined;
  if (roomId) void enter(() => client.joinById<BobaShopState>(roomId, joinOptions()));
}

function joinOptions(roomName?: string): JoinOptions {
  const { id: character, gender } = selectedCharacter;
  return { username: username!, deviceId, character, gender, roomName };
}

function describeError(err: unknown): string {
  const e = err as { code?: number; message?: string };
  switch (e?.code) {
    case JoinError.BAD_NAME:
    case JoinError.NAME_TAKEN:
    case JoinError.ROOM_FULL:
    case JoinError.SHOP_UNAVAILABLE:
      return e.message ?? "Không vào được phòng.";
    case ErrorCode.MATCHMAKE_INVALID_ROOM_ID:
      return "Phòng này không còn nữa.";
  }
  if (err instanceof TypeError || e?.message?.toLowerCase().includes("fetch")) {
    return `Không kết nối được server (${endpoint}). Server đã chạy chưa?`;
  }
  return e?.message || "Có lỗi xảy ra, thử lại nhé.";
}

async function enter(action: () => Promise<Room<BobaShopState>>) {
  if (busy) return;
  setBusy(true);
  lobbyError.textContent = "";
  try {
    startGame(await action());
  } catch (err) {
    console.error(err);
    lobbyError.textContent = describeError(err);
    if ((err as { code?: number })?.code === JoinError.NAME_TAKEN) {
      // Pick another name.
      usernameInput.value = username ?? "";
      username = undefined;
      showLobby(lobbyError.textContent);
      return;
    }
    setUrl();
    setBusy(false);
    void pollLobby();
  }
}

createForm.addEventListener("submit", (e) => {
  e.preventDefault();
  void enter(() => client.create<BobaShopState>(ROOM_NAME, joinOptions(roomNameInput.value)));
});

// ---------------------------------------------------------------- Character (gender) picker

const CHARACTER_KEY = "boba.character";
const LEGACY_GENDER_KEY = "boba.gender"; // before characters existed, only the gender was saved
const genderTabs = [...document.querySelectorAll<HTMLButtonElement>(".gender-tab")];
const charPicker = $<HTMLElement>("char-picker");
const charPreview = $<HTMLElement>("char-preview-big");
const charName = $<HTMLElement>("char-name");

// Remember the last pick; first-time players start with the first female character.
let selectedCharacter: CharacterDef = (() => {
  const saved = getCharacter(localStorage.getItem(CHARACTER_KEY));
  if (saved) return saved;
  const legacy = localStorage.getItem(LEGACY_GENDER_KEY);
  return defaultCharacterOf(isGender(legacy) ? legacy : "female");
})();
/** Last character picked per gender, so switching tabs back and forth keeps the choice. */
const lastPerGender = new Map<Gender, CharacterDef>([[selectedCharacter.gender, selectedCharacter]]);

/** Point a .char-sprite element at a character's sheet (CSS reads the frame layout from these vars). */
function applySprite(el: HTMLElement, c: CharacterDef) {
  const vars: Record<string, string> = {
    "--sheet": `url("${import.meta.env.BASE_URL}${c.sheet}")`,
    "--fw": String(c.frameWidth),
    "--fh": String(c.frameHeight),
    "--cols": String(c.columns),
    "--col": String(c.standColumn),
    "--below": String(c.frameHeight - c.feetRow),
    "--k": String(20 / c.bodyHeight), // CSS sizes are tuned for a 20 px tall body
  };
  for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
}

function renderCharacterPicker(animate = false) {
  const c = selectedCharacter;
  for (const tab of genderTabs) {
    const on = tab.dataset.gender === c.gender;
    tab.classList.toggle("selected", on);
    tab.setAttribute("aria-checked", String(on));
    tab.tabIndex = on ? 0 : -1;
  }

  charPicker.replaceChildren(
    ...charactersOf(c.gender).map((option) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "char-option";
      btn.setAttribute("role", "radio");
      const on = option.id === c.id;
      btn.classList.toggle("selected", on);
      btn.setAttribute("aria-checked", String(on));
      btn.tabIndex = on ? 0 : -1;
      const sprite = document.createElement("span");
      sprite.className = "char-sprite";
      sprite.setAttribute("aria-hidden", "true");
      applySprite(sprite, option);
      const label = document.createElement("span");
      label.textContent = option.name;
      btn.append(sprite, label);
      btn.addEventListener("click", () => selectCharacter(option));
      btn.addEventListener("keydown", (e) => {
        if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
        e.preventDefault();
        const list = charactersOf(c.gender);
        const step = e.key === "ArrowRight" ? 1 : -1;
        selectCharacter(list[(list.indexOf(option) + step + list.length) % list.length], true);
      });
      return btn;
    }),
  );

  applySprite(charPreview, c);
  charName.textContent = c.name;
  if (animate) {
    // Restart the hop animation.
    charPreview.classList.remove("pop");
    void charPreview.offsetWidth;
    charPreview.classList.add("pop");
  }
}

function selectCharacter(c: CharacterDef, focus = false) {
  selectedCharacter = c;
  lastPerGender.set(c.gender, c);
  localStorage.setItem(CHARACTER_KEY, c.id);
  lobbyError.textContent = "";
  renderCharacterPicker(true);
  if (focus) charPicker.querySelector<HTMLButtonElement>(".char-option.selected")?.focus();
}

for (const tab of genderTabs) {
  const pick = (gender: Gender) => selectCharacter(lastPerGender.get(gender) ?? defaultCharacterOf(gender));
  tab.addEventListener("click", () => {
    if (isGender(tab.dataset.gender)) pick(tab.dataset.gender);
  });
  // Radio-group keyboard behaviour: arrows switch the gender.
  tab.addEventListener("keydown", (e) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    const next = genderTabs[(genderTabs.indexOf(tab) + 1) % genderTabs.length];
    if (isGender(next.dataset.gender)) pick(next.dataset.gender);
    next.focus();
  });
}
renderCharacterPicker();
usernameInput.value = username ?? "";

// ---------------------------------------------------------------- Game

function startGame(room: Room<BobaShopState>) {
  currentRoom = room;
  clearTimeout(lobbyPollTimer);
  setUrl(room.roomId); // a refresh comes straight back into this room
  roomNameInput.value = "";
  lobby.hidden = true;
  gameScreen.hidden = false;
  document.body.classList.add("in-game");

  const data: ShopSceneData = { room };
  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    width: WORLD_WIDTH,
    height: WORLD_HEIGHT,
    backgroundColor: "#f6efe6",
    // Scale the fixed 960×600 world to fit the available area (phones, small windows), letterboxed.
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      max: { width: WORLD_WIDTH * 1.5, height: WORLD_HEIGHT * 1.5 },
    },
  });
  patchPhaserForRotation(game);
  game.scene.add("ShopScene", ShopScene, true, data);
  ordersPanel = new OrdersPanel(ordersRoot, room);
  shiftOverlay = new ShiftOverlay(shiftOverlayRoot, room);
  decorPanel = new DecorPanel(
    decorRoot,
    room,
    (e) => game?.events.emit(PALETTE_DRAG_START, e),
    () => game?.events.emit(DECOR_ROTATE),
  );

  const $state = Callbacks.get(room);
  $state.listen("roomName", (name) => (roomTitle.textContent = name || "Tiệm Trà Bé Ngọc Giang"));
  const renderPlayerCount = () => (playerCountLabel.textContent = `${room.state.players.size}/${MAX_PLAYERS}`);
  $state.onAdd("players", renderPlayerCount);
  $state.onRemove("players", renderPlayerCount);

  buildPanel = new BuildPanel(buildRoot, room, (tool) => {
    buildTool = tool;
    game?.events.emit(BUILD_TOOL_EVENT, tool);
  });

  // Only the host decorates (the room shows their furniture), and only between shifts, inside the shop.
  // Building is on the host's land outside the shop: host only, any time.
  let amHost = false;
  let inYard = false;
  const updateDecorateBtn = () => {
    const playing = room.state.phase === GamePhase.Playing;
    const host = room.state.hostName || "chủ phòng";
    decorateBtn.disabled = playing || !amHost || inYard;
    decorateBtn.title = !amHost
      ? `Quán này dùng nội thất của ${host}, chỉ chủ phòng mới trang trí được`
      : inYard
        ? "Vào trong quán để trang trí"
        : "Trang trí quán (ngoài giờ ca)";
    if (decorateBtn.disabled && decorating) setDecorating(false);
    buildBtn.disabled = !amHost || !inYard;
    buildBtn.title = !amHost
      ? `Đất này của ${host}, chỉ chủ phòng mới xây được`
      : inYard
        ? "Xây nhà trên đất trống"
        : "Ra khỏi quán (cửa ở giữa cạnh dưới) để xây nhà";
    if (buildBtn.disabled && building) setBuilding(false);
  };
  game.events.on(AREA_EVENT, (yard: boolean) => {
    inYard = yard;
    updateDecorateBtn();
  });
  $state.listen("phase", updateDecorateBtn);
  $state.listen("hostName", updateDecorateBtn);
  $state.onAdd("players", (player, sessionId) => {
    if (sessionId !== room.sessionId) return;
    $state.listen(player, "host", (host) => {
      amHost = host;
      updateDecorateBtn();
    });
  });

  room.onLeave((code) => {
    if (room !== currentRoom) return; // already left via the "Rời" button
    stopGame();
    setUrl();
    // CONSENTED = we clicked "Rời"; REPLACED = our name joined again from another tab / device.
    if (code === REPLACED_CLOSE_CODE) return showLobby("Bạn đã vào lại từ tab hoặc thiết bị khác.");
    showLobby(code === CloseCode.CONSENTED || code === CloseCode.NORMAL_CLOSURE ? "" : "Mất kết nối với phòng.");
  });
}

function stopGame() {
  game?.destroy(true);
  game = undefined;
  ordersPanel?.destroy();
  shiftOverlay?.destroy();
  decorPanel?.destroy();
  decorPanel = undefined;
  if (decorating) setDecorating(false);
  buildPanel?.destroy();
  buildPanel = undefined;
  if (building) setBuilding(false);
  shiftOverlay = undefined;
  ordersPanel = undefined;
  currentRoom = undefined;
}

leaveBtn.addEventListener("click", () => {
  const room = currentRoom;
  // Back to the lobby right away: the server's close handshake can take seconds behind a proxy
  // (e.g. Render), so don't make the player wait for it. The leave finishes in the background.
  stopGame();
  setUrl();
  showLobby();
  void room?.leave().catch(() => {});
});

copyLinkBtn.addEventListener("click", async () => {
  if (!currentRoom) return;
  const link = `${location.origin}${location.pathname}?${ROOM_PARAM}=${encodeURIComponent(currentRoom.roomId)}`;
  const label = copyLinkBtn.querySelector("span")!;
  try {
    await navigator.clipboard.writeText(link);
    label.textContent = "Đã chép!";
  } catch {
    // Clipboard API needs a secure context (localhost/https); fall back to a prompt over LAN http.
    window.prompt("Sao chép link mời:", link);
  }
  setTimeout(() => (label.textContent = "Mời"), 1500);
});

// ---------------------------------------------------------------- Modal (menu on phones, decoration shop)

function openModal(title: string, content: HTMLElement) {
  modalTitle.textContent = title;
  modalBody.replaceChildren(content);
  modal.hidden = false;
}

function closeModal() {
  modal.hidden = true;
  modalBody.replaceChildren();
}

modalClose.addEventListener("click", closeModal);
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeModal(); // tap on the backdrop
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modal.hidden) closeModal();
});

menuBtn.addEventListener("click", () => openModal("📋 Menu", buildMenu()));

// ---------------------------------------------------------------- Decorate mode (between shifts only)

function setDecorating(on: boolean) {
  if (on && building) setBuilding(false);
  decorating = on;
  decorateBtn.classList.toggle("active", on);
  decorateBtn.querySelector("span")!.textContent = on ? "Xong" : "Trang trí";
  decorRoot.hidden = !on;
  ordersRoot.hidden = on;
  if (on) shiftOverlay?.collapse(); // the shift card would cover the shop
  game?.events.emit(DECORATE_MODE_EVENT, on);
}

// ---------------------------------------------------------------- Build mode (in the yard, host only)

function setBuilding(on: boolean) {
  if (on && decorating) setDecorating(false);
  building = on;
  buildBtn.classList.toggle("active", on);
  buildBtn.querySelector("span")!.textContent = on ? "Xong" : "Xây";
  buildRoot.hidden = !on;
  ordersRoot.hidden = on;
  if (on) {
    shiftOverlay?.collapse();
    game?.events.emit(BUILD_TOOL_EVENT, buildTool);
  }
  game?.events.emit(BUILD_MODE_EVENT, on);
}

buildBtn.addEventListener("click", () => {
  if (!currentRoom || buildBtn.disabled) return;
  setBuilding(!building);
  buildBtn.blur(); // keep Space / WASD for the game
});

decorateBtn.addEventListener("click", () => {
  if (!currentRoom || decorateBtn.disabled) return;
  setDecorating(!decorating);
  decorateBtn.blur(); // keep Space for the game
});

// ---------------------------------------------------------------- Fullscreen (Android; iPhone Safari has no Fullscreen API)

if (isTouchDevice() && document.documentElement.requestFullscreen) {
  fullscreenBtn.hidden = false;
  fullscreenBtn.addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      await document.documentElement.requestFullscreen({ navigationUI: "hide" });
      // Orientation lock only works in fullscreen and isn't supported everywhere.
      const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      await orientation.lock?.("landscape");
    } catch {
      /* not supported on this device — ignore */
    }
  });
}

// ---------------------------------------------------------------- Boot

// Phones always play in landscape (lock where possible, else the page is turned with CSS).
initForceLandscape();

// Full menu shown inline in the side panel on large screens (hidden on phones; 📋 opens it in a modal).
const menuTitle = document.createElement("h2");
menuTitle.textContent = "📋 Menu";
menuInline.append(menuTitle, buildMenu());

showLobby();
