#!/usr/bin/env bash
# Chạy trong ô OpenCode. Chờ Claude giao task qua .agents/queue/*.job,
# rồi tự chạy scripts/run-task.sh cho task đó. Ctrl+C để thoát.
#
# Claude giao việc bằng:   scripts/handoff.sh .agents/tasks/<file>.md
# Trạng thái từng task ghi vào .agents/status/<file>.status để Claude chờ (scripts/wait-task.sh):
#   queued → running → done | stuck

set -uo pipefail

QUEUE=".agents/queue"
STATUS_DIR=".agents/status"
mkdir -p "$QUEUE" "$STATUS_DIR"

notify() {
  # Thông báo macOS + tiếng bíp trong terminal
  osascript -e "display notification \"$2\" with title \"$1\" sound name \"Glass\"" >/dev/null 2>&1 || true
  printf '\a'
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
    if AUTOPILOT=1 scripts/run-task.sh "$task"; then
      set_status "$task" done
      notify "OpenCode đã xong ✅" "$(basename "$task") — Claude tiếp tục"
    else
      set_status "$task" stuck
      notify "OpenCode bị kẹt ⛔" "$(basename "$task") — Claude xử lý"
    fi
  fi

  rm -f "$job.running"
  waiting_msg
done
