import { isTestMode } from "./testHook";

const VERSION_URL = `${import.meta.env.BASE_URL}version.json`;
const POLL_MS = 60_000;

declare global {
  interface Window {
    __UPDATE__?: { check(): Promise<void> };
  }
}

let checking = false;

async function fetchServerBuildId(): Promise<string | null> {
  try {
    const res = await fetch(VERSION_URL, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { id?: unknown } | null;
    return data && typeof data.id === "string" ? data.id : null;
  } catch {
    return null;
  }
}

function showUpdateModal(): void {
  if (document.getElementById("update-modal")) return;
  const backdrop = document.createElement("div");
  backdrop.id = "update-modal";
  backdrop.className = "update-backdrop";
  backdrop.setAttribute("role", "alertdialog");
  backdrop.setAttribute("aria-modal", "true");

  const box = document.createElement("div");
  box.className = "update-card";
  const title = document.createElement("h2");
  title.textContent = "Có phiên bản mới 🎉";
  const text = document.createElement("p");
  text.textContent = "Bản cập nhật vừa ra mắt. Hãy tải lại để tiếp tục chơi.";
  const reload = document.createElement("button");
  reload.id = "update-reload-btn";
  reload.className = "btn primary";
  reload.textContent = "Tải lại";
  reload.addEventListener("click", () => location.reload());
  box.append(title, text, reload);
  backdrop.append(box);
  document.body.append(backdrop);
}

async function check(): Promise<void> {
  if (checking || document.getElementById("update-modal")) return;
  checking = true;
  try {
    const id = await fetchServerBuildId();
    if (id !== null && id !== __BUILD_ID__) showUpdateModal();
  } finally {
    checking = false;
  }
}

/** Polls version.json and shows an undismissable reload popup when a newer build is deployed. */
export function initUpdateChecker(): void {
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape" && document.getElementById("update-modal")) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    true,
  );
  void check();
  window.setInterval(() => void check(), POLL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void check();
  });
  if (isTestMode) window.__UPDATE__ = { check };
}
