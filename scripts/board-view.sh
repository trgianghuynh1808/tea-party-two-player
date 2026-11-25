#!/usr/bin/env bash
# Hiển thị .agents/board.md (phần trước Activity Log) cho pane dashboard.
# Chỉ vẽ lại khi nội dung đổi và ghi đè tại chỗ, không clear => không nháy màn hình.
BOARD=".agents/board.md"
last=""
printf '\033[?25l'                       # ẩn con trỏ
trap 'printf "\033[?25h"' EXIT
while true; do
  cur="$(sed '/^## Activity Log/q' "$BOARD" 2>/dev/null | sed '$d')"
  if [[ "$cur" != "$last" ]]; then
    printf '\033[H\033[2J'               # về đầu rồi xóa, chỉ chạy khi có thay đổi
    printf '%s\n' "$cur"
    last="$cur"
  fi
  sleep 1
done
