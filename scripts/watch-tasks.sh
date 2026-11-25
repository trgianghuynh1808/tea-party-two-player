#!/usr/bin/env bash
# Chạy trong ô OpenCode. Chờ Claude giao task qua .agents/queue/*.job,
# rồi tự chạy scripts/run-task.sh cho task đó. Ctrl+C để thoát.
#
# Claude giao việc bằng:   scripts/handoff.sh .agents/tasks/<file>.md
# Trạng thái từng task ghi vào .agents/status/<file>.status để Claude chờ (scripts/wait-task.sh):
#   queued → running → done | stuck

set -uo pipefail

# pid để /health (bridge) biết watcher còn sống
mkdir -p .agents
echo $$ > .agents/watcher.pid
trap 'rm -f .agents/watcher.pid' EXIT

QUEUE=".agents/queue"
STATUS_DIR=".agents/status"
mkdir -p "$QUEUE" "$STATUS_DIR"

notify() {
  # Thông báo macOS + tiếng bíp trong terminal
  osascript -e "display notification \"$2\" with title \"$1\" sound name \"Glass\"" >/dev/null 2>&1 || true
  printf '\a'
}

say_user() {   # role text — báo ra Telegram qua .agents/outbox khi project là một phòng (có room.env)
  [[ -f .agents/room.env ]] || return 0
  mkdir -p .agents/outbox
  local f=".agents/outbox/$(date +%s)-dev-$RANDOM.json"
  python3 -c 'import json,sys; print(json.dumps({"from": sys.argv[1], "text": sys.argv[2]}, ensure_ascii=False))' "$1" "$2" > "$f.tmp" \
    && mv "$f.tmp" "$f" || true
}

set_status() {   # task state
  local f="$STATUS_DIR/$(basename "$1" .md).status"
  printf '%s %s\n' "$2" "$(date +%s)" > "$f"
}

waiting_msg() {
  echo ""
  echo "👀 Đang chờ task từ Claude ($QUEUE/*.job)... Ctrl+C để thoát."
}

waiting_msg

while true; do
  job=$(ls -1 "$QUEUE"/*.job 2>/dev/null | head -n1 || true)
  if [[ -z "$job" ]]; then
    sleep 3
    continue
  fi

  task=$(head -n1 "$job" | tr -d '[:space:]')
  mv "$job" "$job.running"

  echo ""
  echo "════════════════════════════════════════════"
  echo "🚀 Nhận task từ Claude: $task"
  echo "════════════════════════════════════════════"

  if [[ ! -f "$task" ]]; then
    echo "⚠️  Không thấy file task: $task"
    notify "Giao task lỗi" "Không thấy file $task"
  else
    set_status "$task" running
    say_user dev "Bắt đầu code: $(basename "$task" .md)"
    if AUTOPILOT=1 scripts/run-task.sh "$task"; then
      set_status "$task" done
      say_user dev "Xong các bước code: $(basename "$task" .md). Chuyển Tech Lead verify."
      notify "OpenCode đã xong ✅" "$(basename "$task") — Claude tiếp tục"
    else
      set_status "$task" stuck
      say_user dev "Bị kẹt: $(basename "$task" .md). Chuyển Tech Lead xử lý."
      notify "OpenCode bị kẹt ⛔" "$(basename "$task") — Claude xử lý"
    fi
  fi

  rm -f "$job.running"
  waiting_msg
done
