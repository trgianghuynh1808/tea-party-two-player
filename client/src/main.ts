import "./style.css";
import Phaser from "phaser";
import { Client, CloseCode, ErrorCode, type Room } from "@colyseus/sdk";
import { ROOM_CODE_LENGTH, ROOM_NAME, SERVER_PORT, WORLD_HEIGHT, WORLD_WIDTH, normalizeRoomCode } from "@boba/shared";
import type { BobaShopState } from "@boba/shared/schema";
import { ShopScene, type ShopSceneData } from "./scenes/ShopScene";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const lobby = $<HTMLElement>("lobby");
const gameScreen = $<HTMLElement>("game-screen");
const createBtn = $<HTMLButtonElement>("create-btn");
const joinForm = $<HTMLFormElement>("join-form");
const joinBtn = $<HTMLButtonElement>("join-btn");
const codeInput = $<HTMLInputElement>("code-input");
const lobbyError = $<HTMLParagraphElement>("lobby-error");
const roomCodeLabel = $<HTMLElement>("room-code");
const copyLinkBtn = $<HTMLButtonElement>("copy-link-btn");
const leaveBtn = $<HTMLButtonElement>("leave-btn");

const endpoint = `${location.protocol}//${location.hostname}:${SERVER_PORT}`;
const client = new Client(endpoint);

let game: Phaser.Game | undefined;
let currentRoom: Room<BobaShopState> | undefined;

// ---------------------------------------------------------------- Lobby

function setBusy(busy: boolean) {
  createBtn.disabled = busy;
  joinBtn.disabled = busy;
  codeInput.disabled = busy;
}

function showLobby(error = "") {
  gameScreen.hidden = true;
  lobby.hidden = false;
  lobbyError.textContent = error;
  setBusy(false);
  // Drop ?room=... so a refresh doesn't auto-fill a stale code.
  history.replaceState(null, "", location.pathname);
}

function describeError(err: unknown): string {
  const e = err as { code?: number; message?: string };
  if (e?.code === ErrorCode.MATCHMAKE_INVALID_ROOM_ID) {
    // Server reports a full room as "locked" and a missing one as "not found", both with this code.
    return e.message?.includes("locked") ? "Phòng đã đủ 2 người." : "Không tìm thấy phòng với mã này.";
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
  }
}

createBtn.addEventListener("click", () => {
  void enter(() => client.create<BobaShopState>(ROOM_NAME));
});

joinForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const code = normalizeRoomCode(codeInput.value);
  if (code.length < ROOM_CODE_LENGTH) {
    lobbyError.textContent = `Mã phòng gồm ${ROOM_CODE_LENGTH} ký tự.`;
    codeInput.focus();
    return;
  }
  void enter(() => client.joinById<BobaShopState>(code));
});

codeInput.addEventListener("input", () => {
  const pos = codeInput.selectionStart;
  codeInput.value = normalizeRoomCode(codeInput.value);
  codeInput.setSelectionRange(pos, pos);
  lobbyError.textContent = "";
});

// ---------------------------------------------------------------- Game

function startGame(room: Room<BobaShopState>) {
  currentRoom = room;
  roomCodeLabel.textContent = room.roomId;
  history.replaceState(null, "", `?room=${room.roomId}`);
  lobby.hidden = true;
  gameScreen.hidden = false;

  const data: ShopSceneData = { room };
  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    width: WORLD_WIDTH,
    height: WORLD_HEIGHT,
    backgroundColor: "#f6efe6",
  });
  game.scene.add("ShopScene", ShopScene, true, data);

  room.onLeave((code) => {
    stopGame();
    // CONSENTED = we clicked "Rời phòng"; anything else is an unexpected disconnect.
    showLobby(code === CloseCode.CONSENTED || code === CloseCode.NORMAL_CLOSURE ? "" : "Mất kết nối với phòng.");
  });
}

function stopGame() {
  game?.destroy(true);
  game = undefined;
  currentRoom = undefined;
}

leaveBtn.addEventListener("click", () => {
  if (!currentRoom) return showLobby();
  leaveBtn.disabled = true;
  void currentRoom.leave().finally(() => (leaveBtn.disabled = false));
});

copyLinkBtn.addEventListener("click", async () => {
  if (!currentRoom) return;
  const link = `${location.origin}${location.pathname}?room=${currentRoom.roomId}`;
  try {
    await navigator.clipboard.writeText(link);
    copyLinkBtn.textContent = "Đã sao chép!";
  } catch {
    // Clipboard API needs a secure context (localhost/https); fall back to a prompt over LAN http.
    window.prompt("Sao chép link mời:", link);
  }
  setTimeout(() => (copyLinkBtn.textContent = "Sao chép link mời"), 1500);
});

// ---------------------------------------------------------------- Boot

// Invite links (?room=ABCD) pre-fill the code field.
const invited = normalizeRoomCode(new URLSearchParams(location.search).get("room") ?? "");
showLobby();
codeInput.value = invited;
codeInput.focus();
