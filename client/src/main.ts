import "./style.css";
import Phaser from "phaser";
import { Callbacks, Client, CloseCode, ErrorCode, type Room } from "@colyseus/sdk";
import {
  GamePhase,
  LOBBY_PATH,
  MAX_PLAYERS,
  ROOM_NAME,
  SERVER_PORT,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  SHOP_FULL_ERROR_CODE,
  isGender,
  type Gender,
  type LobbyInfo,
} from "@boba/shared";
import type { BobaShopState } from "@boba/shared/schema";
import { FORCE_TOUCH_PARAM, isTouchDevice } from "./input/TouchControls";
import { DECORATE_MODE_EVENT, ShopScene, type ShopSceneData } from "./scenes/ShopScene";
import { DecorPanel, PALETTE_DRAG_START } from "./ui/DecorPanel";
import { OrdersPanel, buildMenu } from "./ui/OrdersPanel";
import { ShiftOverlay } from "./ui/ShiftOverlay";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const lobby = $<HTMLElement>("lobby");
const gameScreen = $<HTMLElement>("game-screen");
const enterBtn = $<HTMLButtonElement>("enter-btn");
const lobbyStatus = $<HTMLParagraphElement>("lobby-status");
const lobbyError = $<HTMLParagraphElement>("lobby-error");
const playerCountLabel = $<HTMLElement>("player-count");
const copyLinkBtn = $<HTMLButtonElement>("copy-link-btn");
const leaveBtn = $<HTMLButtonElement>("leave-btn");
const menuBtn = $<HTMLButtonElement>("menu-btn");
const decorateBtn = $<HTMLButtonElement>("decorate-btn");
const fullscreenBtn = $<HTMLButtonElement>("fullscreen-btn");
const ordersRoot = $<HTMLElement>("orders-panel");
const decorRoot = $<HTMLElement>("decor-panel");
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

// Keep the ?touch=1 debug flag across URL rewrites so a refresh still forces touch controls.
const forceTouch = new URLSearchParams(location.search).get(FORCE_TOUCH_PARAM) === "1";

/** Strip other query params (e.g. old ?room= invite links), preserving ?touch=1. */
function cleanUrl() {
  const params = new URLSearchParams();
  if (forceTouch) params.set(FORCE_TOUCH_PARAM, "1");
  const query = params.toString();
  history.replaceState(null, "", location.pathname + (query ? `?${query}` : ""));
}

// ---------------------------------------------------------------- Lobby

let busy = false;
let lobbyInfo: LobbyInfo | undefined;
let lobbyPollTimer: ReturnType<typeof setTimeout> | undefined;
const LOBBY_POLL_MS = 3000;

function setBusy(on: boolean) {
  busy = on;
  renderLobbyStatus();
}

function renderLobbyStatus() {
  const info = lobbyInfo;
  const full = !!info && info.open && info.players >= info.maxPlayers;
  lobbyStatus.classList.toggle("open", !!info?.open && !full);
  lobbyStatus.classList.toggle("full", full);
  if (!info) {
    lobbyStatus.textContent = "Đang kết nối server… (lần đầu có thể mất ~1 phút)";
    enterBtn.textContent = "Vào quán";
  } else if (!info.open) {
    lobbyStatus.textContent = "Quán đang đóng cửa.";
    enterBtn.textContent = "Mở quán";
  } else if (full) {
    lobbyStatus.textContent = `Quán đã đủ ${info.maxPlayers} người, chờ chút nhé.`;
    enterBtn.textContent = "Quán đã đủ người";
  } else {
    lobbyStatus.textContent = `🟢 Quán đang mở · ${info.players}/${info.maxPlayers} người`;
    enterBtn.textContent = "Vào quán";
  }
  enterBtn.disabled = busy || full;
}

/** Poll the shop status while the home screen is visible (also wakes a sleeping free-tier server). */
async function pollLobby() {
  clearTimeout(lobbyPollTimer);
  if (lobby.hidden) return;
  try {
    const res = await fetch(`${endpoint}${LOBBY_PATH}`, { cache: "no-store" });
    if (res.ok) lobbyInfo = (await res.json()) as LobbyInfo;
  } catch {
    lobbyInfo = undefined; // server asleep or unreachable: keep trying
  }
  if (lobby.hidden) return;
  renderLobbyStatus();
  lobbyPollTimer = setTimeout(() => void pollLobby(), LOBBY_POLL_MS);
}

function showLobby(error = "") {
  document.body.classList.remove("in-game");
  closeModal();
  gameScreen.hidden = true;
  lobby.hidden = false;
  lobbyError.textContent = error;
  setBusy(false);
  cleanUrl();
  void pollLobby();
}

function describeError(err: unknown): string {
  const e = err as { code?: number; message?: string };
  if (e?.code === SHOP_FULL_ERROR_CODE || e?.code === ErrorCode.MATCHMAKE_INVALID_ROOM_ID) {
    return "Quán đã đủ người, chờ chút rồi thử lại nhé.";
  }
  if (err instanceof TypeError || e?.message?.toLowerCase().includes("fetch")) {
    return `Không kết nối được server (${endpoint}). Server đã chạy chưa?`;
  }
  return e?.message || "Có lỗi xảy ra, thử lại nhé.";
}

async function enter(action: () => Promise<Room<BobaShopState>>) {
  setBusy(true);
  lobbyError.textContent = "";
  try {
    startGame(await action());
  } catch (err) {
    console.error(err);
    lobbyError.textContent = describeError(err);
    setBusy(false);
    void pollLobby();
  }
}

// ---------------------------------------------------------------- Character (gender) picker

const GENDER_KEY = "boba.gender";
const genderOptions = [...document.querySelectorAll<HTMLButtonElement>(".gender-option")];
// Remember the last pick for convenience; first-time players must choose.
let selectedGender: Gender | null = (() => {
  const saved = localStorage.getItem(GENDER_KEY);
  return isGender(saved) ? saved : null;
})();

function renderGenderPicker() {
  for (const btn of genderOptions) {
    const on = btn.dataset.gender === selectedGender;
    btn.classList.toggle("selected", on);
    btn.setAttribute("aria-checked", String(on));
  }
}

for (const btn of genderOptions) {
  btn.addEventListener("click", () => {
    const gender = btn.dataset.gender;
    if (!isGender(gender)) return;
    selectedGender = gender;
    localStorage.setItem(GENDER_KEY, gender);
    lobbyError.textContent = "";
    renderGenderPicker();
  });
}

/** Returns the chosen character, or shows an error if none was picked yet. */
function requireGender(): Gender | null {
  if (selectedGender) return selectedGender;
  lobbyError.textContent = "Chọn nhân vật Nam hoặc Nữ trước khi vào quán nhé.";
  genderOptions[0]?.focus();
  return null;
}

enterBtn.addEventListener("click", () => {
  const gender = requireGender();
  if (!gender) return;
  // Joins the shared shop if it's open, otherwise opens it.
  void enter(() => client.joinOrCreate<BobaShopState>(ROOM_NAME, { gender }));
});

// ---------------------------------------------------------------- Game

function startGame(room: Room<BobaShopState>) {
  currentRoom = room;
  clearTimeout(lobbyPollTimer);
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
  game.scene.add("ShopScene", ShopScene, true, data);
  ordersPanel = new OrdersPanel(ordersRoot, room);
  shiftOverlay = new ShiftOverlay(shiftOverlayRoot, room);
  decorPanel = new DecorPanel(decorRoot, room, (e) => game?.events.emit(PALETTE_DRAG_START, e));

  const $state = Callbacks.get(room);
  const renderPlayerCount = () => (playerCountLabel.textContent = `${room.state.players.size}/${MAX_PLAYERS}`);
  $state.onAdd("players", renderPlayerCount);
  $state.onRemove("players", renderPlayerCount);

  // Decorating is only allowed between shifts: leave decorate mode when a shift starts.
  $state.listen("phase", (phase) => {
    const playing = phase === GamePhase.Playing;
    decorateBtn.disabled = playing;
    if (playing && decorating) setDecorating(false);
  });

  room.onLeave((code) => {
    stopGame();
    // CONSENTED = we clicked "Rời phòng"; anything else is an unexpected disconnect.
    showLobby(code === CloseCode.CONSENTED || code === CloseCode.NORMAL_CLOSURE ? "" : "Mất kết nối với quán.");
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
  shiftOverlay = undefined;
  ordersPanel = undefined;
  currentRoom = undefined;
}

leaveBtn.addEventListener("click", () => {
  if (!currentRoom) return showLobby();
  leaveBtn.disabled = true;
  void currentRoom.leave().finally(() => (leaveBtn.disabled = false));
});

copyLinkBtn.addEventListener("click", async () => {
  if (!currentRoom) return;
  const link = `${location.origin}${location.pathname}`;
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
  decorating = on;
  decorateBtn.classList.toggle("active", on);
  decorateBtn.querySelector("span")!.textContent = on ? "Xong" : "Trang trí";
  decorRoot.hidden = !on;
  ordersRoot.hidden = on;
  if (on) shiftOverlay?.collapse(); // the shift card would cover the shop
  game?.events.emit(DECORATE_MODE_EVENT, on);
}

decorateBtn.addEventListener("click", () => {
  if (!currentRoom || currentRoom.state?.phase === GamePhase.Playing) return;
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

// Full menu shown inline in the side panel on large screens (hidden on phones; 📋 opens it in a modal).
const menuTitle = document.createElement("h2");
menuTitle.textContent = "📋 Menu";
menuInline.append(menuTitle, buildMenu());

showLobby();
