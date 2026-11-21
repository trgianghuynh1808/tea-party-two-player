#!/usr/bin/env bash
# Claude giao một task cho OpenCode (watch-tasks.sh sẽ nhận).
#
#   scripts/handoff.sh .agents/tasks/<file>.md
#
# Yêu cầu: file task đã được commit, working tree sạch.

set -euo pipefail

TASK="${1:?Usage: scripts/handoff.sh .agents/tasks/<file>.md}"
[[ -f "$TASK" ]] || { echo "Không thấy file task: $TASK"; exit 1; }

if [[ -n "$(git status --porcelain)" ]]; then
  echo "⛔ Working tree chưa sạch. Commit file task (và mọi thay đổi khác) trước khi giao việc."
  git status --short
  exit 1
fi

mkdir -p .agents/queue .agents/status
printf 'queued %s\n' "$(date +%s)" > ".agents/status/$(basename "$TASK" .md).status"
echo "$TASK" > ".agents/queue/$(date +%s).job"

echo "✅ Đã giao $TASK cho OpenCode (nhánh $(git rev-parse --abbrev-ref HEAD))."
echo "   Chờ kết quả: scripts/wait-task.sh $TASK"
