#!/usr/bin/env bash
# Nạp cấu hình phòng từ .agents/room.env (nếu có) — dùng bằng `source scripts/room-env.sh`.
# Không có room.env thì mọi biến lấy giá trị mặc định, kit chạy như chế độ 1 project như cũ.
#
# Sau khi source:
#   APP_PORT, PLAYWRIGHT_BASE_URL, AUTO_MODE, MAIN_BRANCH, STAGING_BRANCH, MAX_FIX_CYCLES, BASE_BRANCH
#   BASE_BRANCH = STAGING_BRANCH khi AUTO_MODE=true, ngược lại MAIN_BRANCH (nhánh để tách/merge task)

ROOM_ENV_FILE="${ROOM_ENV_FILE:-.agents/room.env}"
if [[ -f "$ROOM_ENV_FILE" ]]; then
  # shellcheck source=/dev/null
  source "$ROOM_ENV_FILE"
fi

APP_PORT="${APP_PORT:-}"
if [[ -z "${PLAYWRIGHT_BASE_URL:-}" && -n "$APP_PORT" ]]; then
  PLAYWRIGHT_BASE_URL="http://localhost:$APP_PORT"
fi
PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL:-}"
AUTO_MODE="${AUTO_MODE:-false}"
MAIN_BRANCH="${MAIN_BRANCH:-main}"
STAGING_BRANCH="${STAGING_BRANCH:-staging}"
MAX_FIX_CYCLES="${MAX_FIX_CYCLES:-2}"

if [[ "$AUTO_MODE" == "true" ]]; then BASE_BRANCH="$STAGING_BRANCH"; else BASE_BRANCH="$MAIN_BRANCH"; fi

[[ -n "$PLAYWRIGHT_BASE_URL" ]] && export PLAYWRIGHT_BASE_URL
[[ -n "$APP_PORT" ]] && export APP_PORT
export AUTO_MODE MAIN_BRANCH STAGING_BRANCH MAX_FIX_CYCLES BASE_BRANCH
