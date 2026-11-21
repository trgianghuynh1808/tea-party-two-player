#!/usr/bin/env bash
# Claude chờ OpenCode làm xong một task đã giao bằng scripts/handoff.sh.
# Chờ tối đa MAX_WAIT giây (mặc định 540, vừa dưới giới hạn 10 phút của một lệnh trong Claude Code),
# rồi trả về để Claude gọi lại nếu task vẫn đang chạy.
#
#   scripts/wait-task.sh .agents/tasks/<file>.md
#
# Exit code:
#   0  done     — OpenCode xong mọi bước code → Claude verify / review
#   2  stuck    — OpenCode bị kẹt → Claude xử lý (xem các mục in ra)
#   3  running  — chưa xong sau MAX_WAIT giây → gọi lại lệnh này
#   1  lỗi      — không có trạng thái (chưa handoff?) hoặc watcher không chạy

set -uo pipefail

TASK="${1:?Usage: scripts/wait-task.sh .agents/tasks/<file>.md}"
MAX_WAIT="${MAX_WAIT:-540}"
POLL="${POLL:-10}"
STATUS=".agents/status/$(basename "$TASK" .md).status"

section() {
  awk -v h="## $1" '
    $0 == h { f = 1; next }
    /^## / { f = 0 }
    f && NF && $0 !~ /^<!--/ { print }
  ' "$TASK" | head -n "${2:-8}"
}

progress() {
  local total done_
  total=$(grep -cE '^- \[[ x]\] [0-9]+\.' "$TASK" || true)
  done_=$(grep -cE '^- \[x\] [0-9]+\.' "$TASK" || true)
  echo "$done_/$total bước"
}

[[ -f "$STATUS" ]] || { echo "ERROR: không có $STATUS — đã chạy scripts/handoff.sh chưa?"; exit 1; }

start=$SECONDS
while (( SECONDS - start < MAX_WAIT )); do
  state=$(awk '{print $1}' "$STATUS" 2>/dev/null || echo unknown)
  case "$state" in
    done)
      echo "STATUS: done — $(progress). OpenCode đã xong các bước code."
      echo "Tiếp theo: verify theo 'Verify mode', rồi review."
      exit 0 ;;
    stuck)
      echo "STATUS: stuck — $(progress)."
      echo ""
      echo "## Trạng thái hiện tại"; section "Trạng thái hiện tại" 8
      echo ""
      echo "## Đã thử mà không được"; section "Đã thử mà không được" 12
      echo ""
      echo "Chi tiết: tail -n 80 .agents/run.log · test-results/results.json"
      exit 2 ;;
    queued)
      # Watcher nhận job trong vài giây; quá 60s vẫn queued thì có lẽ watcher không chạy
      queued_at=$(awk '{print $2}' "$STATUS")
      if (( $(date +%s) - queued_at > 60 )); then
        echo "ERROR: task vẫn 'queued' sau 60s — scripts/watch-tasks.sh có đang chạy không?"
        exit 1
      fi ;;
  esac
  sleep "$POLL"
done

echo "STATUS: running — $(progress), đã chờ ${MAX_WAIT}s. Gọi lại: scripts/wait-task.sh $TASK"
exit 3
