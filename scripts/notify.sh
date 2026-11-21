#!/usr/bin/env bash
# Gửi thông báo desktop (macOS) + tiếng bíp. Dùng: scripts/notify.sh "Tiêu đề" "Nội dung"
osascript -e "display notification \"${2:-}\" with title \"${1:-claude-opencode-kit}\" sound name \"Glass\"" >/dev/null 2>&1 || true
printf '\a'
echo "🔔 ${1:-} — ${2:-}"
