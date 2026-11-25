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

# Báo ra Telegram qua .agents/outbox khi project là một phòng (có room.env); room-ops.py lo định dạng và thứ tự
OPS=".agents/bin/room-ops.py"; [[ -f "$OPS" ]] || OPS="scripts/room-ops.py"
say_user() {   # role text
  [[ -f .agents/room.env && -f "$OPS" ]] || return 0
  python3 "$OPS" say "$1" "$2" >/dev/null 2>&1 || true
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

  # File plan chỉ có trên nhánh task/<slug>: nếu cây làm việc đang ở nhánh khác (vd staging), chuyển sang nhánh task
  if [[ ! -f "$task" ]]; then
    slug=$(basename "$task" .md | sed -E 's/^[0-9]{4}-[0-9]{2}-[0-9]{2}-//')
    if git show-ref --quiet "refs/heads/task/$slug" && [[ -z "$(git status --porcelain)" ]]; then
      echo "↪  Không thấy $task ở nhánh hiện tại, chuyển sang task/$slug"
      git checkout -q "task/$slug" || true
    fi
  fi

  if [[ ! -f "$task" ]]; then
    echo "⚠️  Không thấy file task: $task (nhánh $(git rev-parse --abbrev-ref HEAD))"
    notify "Giao task lỗi" "Không thấy file $task"
    # Báo cho bên chờ biết ngay, nếu không status kẹt ở 'queued' và wait-task.sh chỉ đoán "watcher không chạy"
    mkdir -p "$STATUS_DIR"
    printf 'stuck %s\n' "$(date +%s)" > "$STATUS_DIR/$(basename "$task" .md).status"
    say_user dev "Huhu, mình không tìm thấy file task \`$(basename "$task")\` 😭 (đang ở nhánh \`$(git rev-parse --abbrev-ref HEAD)\`). Mình đánh dấu task là kẹt, nhờ Tech Lead xem giúp nha."
  else
    set_status "$task" running
    say_user dev "Nhận việc rồi! Bắt tay vào code thôi 💪⌨️\n- \`$(basename "$task" .md | sed -E 's/^[0-9]{4}-[0-9]{2}-[0-9]{2}-//')\`"
    if AUTOPILOT=1 scripts/run-task.sh "$task"; then
      set_status "$task" done
      say_user dev "Code xong hết rồi nè! 🎉 Mình chuyển cho Tech Lead verify nhé."
      notify "OpenCode đã xong ✅" "$(basename "$task") — Claude tiếp tục"
    else
      set_status "$task" stuck
      say_user dev "Mình bị kẹt rồi 😵 Nhờ Tech Lead xem giúp nha."
      notify "OpenCode bị kẹt ⛔" "$(basename "$task") — Claude xử lý"
    fi
  fi

  rm -f "$job.running"
  waiting_msg
done
