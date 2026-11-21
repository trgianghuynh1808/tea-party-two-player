#!/usr/bin/env bash
# Chạy tự động các bước trong một file task bằng OpenCode, chọn model theo nhãn độ khó.
#
# Cách dùng:
#   scripts/run-task.sh .agents/tasks/2026-11-21-e2e-foundation.md
#
# Quy ước trong file task (Claude viết khi lên plan):
#   - [ ] 1. [dễ] ...
#   - [ ] 2. [vừa] ...
#   - [ ] 3. [khó] ...
#
# Leo thang khi một bước chưa xong:  dễ → vừa → khó → dừng (chuyển Claude)

set -euo pipefail

TASK="${1:?Usage: scripts/run-task.sh .agents/tasks/<file>.md}"
MAX_RUNS="${MAX_RUNS:-20}"            # giới hạn tổng số lần gọi OpenCode, tránh chạy vòng vô hạn
LOG=".agents/run.log"

# Đổi model ở đây nếu cần (xem ID chính xác bằng: opencode models)
MODELS=(
  "opencode-go/deepseek-v4.1-flash"   # 0: dễ
  "opencode-go/glm-5.3"               # 1: vừa
  "opencode-go/kimi-k3.1-pro"         # 2: khó
)
LABELS=("dễ" "vừa" "khó")

[[ -f "$TASK" ]] || { echo "Không thấy file task: $TASK"; exit 1; }

if [[ -n "$(git status --porcelain)" ]]; then
  echo "⚠️  Working tree đang có thay đổi chưa commit. Commit hoặc stash trước khi chạy."
  exit 1
fi

runs=0
last_step=""
level=1

while (( runs < MAX_RUNS )); do
  line=$(grep -m1 -E '^- \[ \] [0-9]+\.' "$TASK" || true)
  if [[ -z "$line" ]]; then
    echo "✅ Đã xong mọi bước trong plan."
    echo "   Tiếp theo: mở Claude → /clear → review git diff + file task."
    exit 0
  fi

  step=$(sed -E 's/^- \[ \] ([0-9]+)\..*/\1/' <<< "$line")

  # Bước mới: lấy độ khó từ nhãn. Bước cũ chưa xong: leo thang 1 bậc.
  if [[ "$step" != "$last_step" ]]; then
    case "$line" in
      *"[dễ]"*)  level=0 ;;
      *"[khó]"*) level=2 ;;
      *)         level=1 ;;
    esac
  else
    level=$((level + 1))
    if (( level > 2 )); then
      echo "⛔ Bước $step vẫn chưa xong sau khi đã thử tới model mạnh nhất."
      echo "   Chuyển cho Claude: \"Đọc $TASK và test-results/results.json. Tìm nguyên nhân bước $step và sửa.\""
      exit 1
    fi
    echo "↗️  Leo thang bước $step lên mức [${LABELS[$level]}]"
  fi

  model="${MODELS[$level]}"
  last_step="$step"
  runs=$((runs + 1))

  echo ""
  echo "▶ Bước $step · ${LABELS[$level]} · $model  (lần chạy $runs/$MAX_RUNS)"
  echo "=== $(date '+%F %T') · bước $step · $model ===" >> "$LOG"

  prompt="Đọc AGENTS.md và $TASK. CHỈ làm bước $step, không làm bước khác.
Khi xong: chạy npm run typecheck và npx playwright test; commit với message rõ ràng;
tick checkbox của bước $step; cập nhật 'Trạng thái hiện tại' và 'Test status'.
Nếu sau 2 lần sửa vẫn fail: KHÔNG tick checkbox, ghi nguyên nhân và cách đã thử vào
'Đã thử mà không được', commit file task, rồi dừng."

  # || true: nếu OpenCode lỗi, vẫn đi tiếp để kiểm tra checkbox và leo thang
  opencode run --model "$model" "$prompt" 2>&1 | tee -a "$LOG" || true
done

echo "⏸  Đã chạm giới hạn $MAX_RUNS lần chạy. Dừng để bạn kiểm tra file task và $LOG."
exit 1
