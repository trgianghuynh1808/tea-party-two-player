#!/usr/bin/env bash
# Quản lý "phòng" (một project = một phòng). Chạy ở thư mục gốc của project.
#
#   scripts/agent-room.sh init --topic <ID> --port <PORT> [--name <tên>]   tạo .agents/, room.env, board.md, đăng ký bridge
#   scripts/agent-room.sh start                                            bật bridge (nếu chưa chạy) + manager-loop.sh + watch-tasks.sh ngầm (pm2 hoặc tmux)
#   scripts/agent-room.sh stop                                             dừng các daemon của phòng
#   scripts/agent-room.sh status                                           trạng thái tiến trình + board.md
#
# Biến: ROOM_RUNNER=pm2|tmux (mặc định: pm2 nếu có, không thì tmux) · AGENT_ROOMS_FILE (registry của bridge-bot)

set -euo pipefail

ROOM_DIR="$(pwd)"
AG=".agents"

die() { echo "⛔ $*" >&2; exit 1; }

room_name() {
  local n=""
  [[ -f "$AG/room.env" ]] && n="$(sed -nE 's/^PROJECT_NAME="?([^"]*)"?$/\1/p' "$AG/room.env" | head -1)"
  n="${n:-$(basename "$ROOM_DIR")}"
  echo "$n" | tr -c 'A-Za-z0-9_.-\n' '-'
}

rooms_file() {
  if [[ -n "${AGENT_ROOMS_FILE:-}" ]]; then echo "$AGENT_ROOMS_FILE"; return; fi
  if [[ -f "$AG/kit-dir" ]]; then echo "$(cat "$AG/kit-dir")/bridge-bot/rooms.json"; return; fi
  echo "$HOME/.agent-kit/rooms.json"
}

runner() {
  if [[ -n "${ROOM_RUNNER:-}" ]]; then echo "$ROOM_RUNNER"
  elif command -v pm2 >/dev/null 2>&1; then echo pm2
  elif command -v tmux >/dev/null 2>&1; then echo tmux
  else die "Cần pm2 (npm i -g pm2) hoặc tmux để chạy ngầm."; fi
}

cmd_init() {
  local topic="" port="" name=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --topic) topic="${2:?--topic cần giá trị}"; shift 2 ;;
      --port)  port="${2:?--port cần giá trị}"; shift 2 ;;
      --name)  name="${2:?--name cần giá trị}"; shift 2 ;;
      *) die "Tham số lạ: $1" ;;
    esac
  done
  [[ -n "$topic" && -n "$port" ]] || die "Cách dùng: agent-room.sh init --topic <ID> --port <PORT> [--name <tên>]"
  [[ "$topic" =~ ^[0-9]+$ && "$port" =~ ^[0-9]+$ ]] || die "--topic và --port phải là số"
  git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "Không phải git repo."
  name="${name:-$(basename "$ROOM_DIR")}"

  mkdir -p "$AG"/{inbox/processed,inbox/failed,outbox/sent,screenshots,tasks,logs,queue,status}
  if [[ -f "$AG/room.env" ]]; then
    echo "  • $AG/room.env đã có, giữ nguyên"
  else
    cat > "$AG/room.env" <<ENV
PROJECT_NAME="$name"
TELEGRAM_TOPIC_ID="$topic"
APP_PORT="$port"
PLAYWRIGHT_BASE_URL="http://localhost:$port"
AUTO_MODE="false"
STAGING_BRANCH="staging"
MAIN_BRANCH="main"
MAX_FIX_CYCLES="2"
# Model theo vai (alias haiku | sonnet | opus hoặc id đầy đủ). Trống = mặc định của claude CLI.
MODEL_MANAGER=""
MODEL_TECHLEAD=""
# Giới hạn số lượt mỗi lần gọi (chặn một lần chạy lạc đốt quota)
MAX_TURNS_MANAGER="20"
MAX_TURNS_TECHLEAD="150"
# Duyệt plan: "auto" = tự duyệt, chỉ giữ lại khi plan rủi ro nghiêm trọng / thiếu ngữ cảnh / bị chặn (rồi làm task kế tiếp); "ask" = luôn gửi THẺ có nút Duyệt / Sửa plan / Hủy và chờ bạn
PLAN_APPROVAL="auto"
# Tin báo bước của Dev kèm link commit trên GitHub: daemon sẽ git push nhánh task lên origin (xóa sau /ship). "false" = không push, không link
COMMIT_LINKS="true"
# Chế độ /plan (Tech Lead đọc repo để trả lời câu hỏi): giới hạn số lượt
MAX_TURNS_PLAN="40"
# /task tách task: "lines" (mỗi dòng một task, không tốn Claude) hoặc "claude" (Manager tách)
AUTO_SPLIT="lines"
# Sau /ship, giữ lại bao nhiêu task đã ship gần nhất trên board (phần cũ hơn được gỡ và ghi vào Activity Log)
KEEP_SHIPPED="5"
# Tin thường (không có lệnh): "false" = trả lời mẫu, "true" = để Claude Manager trả lời (tốn quota)
CHAT_WITH_CLAUDE="false"
ENV
    echo "  ✓ $AG/room.env"
  fi
  if [[ -f "$AG/board.md" ]]; then
    echo "  • $AG/board.md đã có, giữ nguyên"
  else
    cat > "$AG/board.md" <<BOARD
# Project Board: $name

- **Auto Mode:** OFF
- **Current Phase:** IDLE
- **Staging Branch:** staging

## Checklist & Tasks

## Activity Log

- [$(date '+%F %H:%M')] Khởi tạo phòng thành công.
BOARD
    echo "  ✓ $AG/board.md"
  fi

  touch .gitignore
  for e in ".agents/board.md" ".agents/room.env" ".agents/inbox/" ".agents/outbox/" ".agents/screenshots/" ".agents/logs/" ".agents/manager.lock" ".agents/manager.sig" ".agents/kit-dir" ".agents/kit-version" ".agents/watcher.pid" ".agents/plan.pid" ".agents/plan/" ".agents/plan-feedback/" ".agents/board-archive/" ".agents/notices/" ".agents/progress/" ".agents/timeline/" ".agents/attachments/" ".agents/bin/"; do
    grep -qxF "$e" .gitignore || { echo "$e" >> .gitignore; echo "  ✓ .gitignore: $e"; }
  done

  local reg; reg="$(rooms_file)"
  mkdir -p "$(dirname "$reg")"
  python3 - "$reg" "$topic" "$name" "$ROOM_DIR" <<'PY'
import json, os, sys
reg, topic, name, path = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4]
data = {"rooms": []}
if os.path.exists(reg):
    with open(reg) as f:
        data = json.load(f)
rooms = [r for r in data.get("rooms", []) if r.get("topicId") != topic and r.get("path") != path]
rooms.append({"topicId": topic, "name": name, "path": path})
data["rooms"] = rooms
tmp = reg + ".tmp"
with open(tmp, "w") as f:
    json.dump(data, f, indent=2, ensure_ascii=False); f.write("\n")
os.replace(tmp, reg)
PY
  echo "  ✓ đăng ký topic $topic → $ROOM_DIR trong $reg"
  echo ""
  echo "Xong. Tiếp theo: scripts/agent-room.sh start   (nhớ commit .gitignore)"
}

ensure_bridge() {   # bật bridge bot nếu chưa chạy (cần .agents/kit-dir do install.sh ghi)
  [[ -z "${AGENT_BRIDGE_UP:-}" ]] || return 0   # đang được chính bridge gọi (/newroom): bridge chắc chắn đang chạy
  local kit; kit="$(cat "$AG/kit-dir" 2>/dev/null || true)"
  if [[ -x "$kit/bridge-bot/bridge.sh" ]]; then
    "$kit/bridge-bot/bridge.sh" start || echo "⚠️  Không bật được bridge — phòng vẫn chạy, nhưng Telegram chưa nối."
  else
    echo "⚠️  Không thấy bridge-bot (.agents/kit-dir). Tự chạy bridge nếu cần."
  fi
}

cmd_start() {
  [[ -f "$AG/room.env" ]] || die "Chưa init phòng này."
  ensure_bridge
  local name r; name="$(room_name)"; r="$(runner)"
  case "$r" in
    pm2)
      pm2 describe "room-$name-manager" >/dev/null 2>&1 && die "Phòng đã chạy (pm2). Dùng stop trước."
      pm2 start scripts/manager-loop.sh --name "room-$name-manager" --interpreter bash --cwd "$ROOM_DIR" --no-autorestart >/dev/null
      pm2 start scripts/watch-tasks.sh  --name "room-$name-watcher" --interpreter bash --cwd "$ROOM_DIR" --no-autorestart >/dev/null
      echo "✅ Phòng '$name' chạy bằng pm2: room-$name-manager, room-$name-watcher (pm2 logs room-$name-manager)" ;;
    tmux)
      tmux has-session -t "room-$name" 2>/dev/null && die "Phòng đã chạy (tmux). Dùng stop trước."
      mkdir -p "$AG/logs"; touch "$AG/logs/activity.log"
      # dashboard: board (trái trên) · log gộp (trái dưới) · OpenCode watcher (phải); manager-loop chạy ở cửa sổ riêng
      tmux new-session -d -s "room-$name" -n dashboard -c "$ROOM_DIR" "scripts/board-view.sh"
      tmux split-window -h -t "room-$name:dashboard" -c "$ROOM_DIR" "scripts/watch-tasks.sh"
      tmux split-window -v -t "room-$name:dashboard.0" -c "$ROOM_DIR" "tail -n 40 -F $AG/logs/activity.log"
      tmux new-window -t "room-$name" -n manager -c "$ROOM_DIR" "scripts/manager-loop.sh"
      tmux set-option -t "room-$name" mouse on >/dev/null
      tmux select-window -t "room-$name:dashboard"
      echo "✅ Phòng '$name' chạy bằng tmux: session room-$name (tmux attach -t room-$name)" ;;
    *) die "ROOM_RUNNER không hợp lệ: $r" ;;
  esac
}

cmd_stop() {
  local name stopped=0; name="$(room_name)"
  if command -v pm2 >/dev/null 2>&1; then
    for p in manager watcher; do
      if pm2 describe "room-$name-$p" >/dev/null 2>&1; then pm2 delete "room-$name-$p" >/dev/null; stopped=1; fi
    done
  fi
  if command -v tmux >/dev/null 2>&1 && tmux has-session -t "room-$name" 2>/dev/null; then
    tmux kill-session -t "room-$name"; stopped=1
  fi
  rm -f "$AG/manager.lock"
  (( stopped )) && echo "🛑 Đã dừng phòng '$name'." || echo "Phòng '$name' không chạy."
}

cmd_status() {
  local name; name="$(room_name)"
  echo "Phòng: $name ($ROOM_DIR)"
  if command -v pm2 >/dev/null 2>&1; then
    for p in manager watcher; do
      pm2 describe "room-$name-$p" >/dev/null 2>&1 && echo "  pm2  room-$name-$p: $(pm2 jlist 2>/dev/null | python3 -c "import json,sys; print(next((x['pm2_env']['status'] for x in json.load(sys.stdin) if x['name']=='room-$name-$p'),'?'))")"
    done
  fi
  if command -v tmux >/dev/null 2>&1 && tmux has-session -t "room-$name" 2>/dev/null; then echo "  tmux room-$name: chạy"; fi
  if [[ -f "$AG/manager.lock" ]] && kill -0 "$(cat "$AG/manager.lock")" 2>/dev/null; then
    echo "  manager-loop: pid $(cat "$AG/manager.lock")"
  else
    echo "  manager-loop: không chạy"
  fi
  [[ -f "$AG/room.env" ]] && grep -E '^(AUTO_MODE|APP_PORT|TELEGRAM_TOPIC_ID)=' "$AG/room.env" | sed 's/^/  /'
  echo "  inbox: $(ls "$AG"/inbox/*.json 2>/dev/null | wc -l | tr -d ' ') · outbox: $(ls "$AG"/outbox/*.json 2>/dev/null | wc -l | tr -d ' ') chờ gửi"
  echo ""
  [[ -f "$AG/board.md" ]] && cat "$AG/board.md" || echo "(chưa có board.md)"
}

case "${1:-}" in
  init)   shift; cmd_init "$@" ;;
  start)  cmd_start ;;
  stop)   cmd_stop ;;
  status) cmd_status ;;
  *) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
