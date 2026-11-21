#!/usr/bin/env bash
# Chạy trong ô OpenCode. Chờ Claude giao task qua .agents/queue/*.job,
# rồi tự chạy scripts/run-task.sh cho task đó. Ctrl+C để thoát.
#
# Claude giao việc bằng:
#   echo .agents/tasks/<file>.md > .agents/queue/$(date +%s).job

set -uo pipefail

QUEUE=".agents/queue"
mkdir -p "$QUEUE"

notify() {
  # Thông báo macOS + tiếng bíp trong terminal
  osascript -e "display notification \"$2\" with title \"$1\" sound name \"Glass\"" >/dev/null 2>&1 || true
  printf '\a'
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
  elif scripts/run-task.sh "$task"; then
    notify "OpenCode đã xong ✅" "Quay lại Claude để review: $(basename "$task")"
  else
    notify "OpenCode cần trợ giúp ⛔" "Xem file task rồi chuyển cho Claude: $(basename "$task")"
  fi

  rm -f "$job.running"
  waiting_msg
done
