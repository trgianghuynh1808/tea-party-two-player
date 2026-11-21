#!/usr/bin/env bash
# Chạy tự động các bước trong một file task bằng OpenCode, chọn model theo nhãn độ khó,
# rồi tự kiểm tra trên trình duyệt (Verify).
#
# Cách dùng:
#   scripts/run-task.sh .agents/tasks/<file>.md
#   VERBOSE=1 scripts/run-task.sh ...     # hiện toàn bộ output của OpenCode như cũ
#
# Màn hình chỉ hiện tóm tắt. Chi tiết đầy đủ nằm trong .agents/run.log
#   (xem trực tiếp ở ô khác: tail -f .agents/run.log)
#
# Quy ước trong file task:  - [ ] N. [dễ|vừa|khó] ...
# Leo thang khi một bước chưa xong:  dễ → vừa → khó → dừng (chuyển Claude)

set -euo pipefail

TASK="${1:?Usage: scripts/run-task.sh .agents/tasks/<file>.md}"
MAX_RUNS="${MAX_RUNS:-20}"
VERBOSE="${VERBOSE:-0}"
LOG=".agents/run.log"

# Đổi model ở đây nếu cần (xem ID chính xác bằng: opencode models)
MODELS=(
  "opencode-go/deepseek-v4.1-flash"   # 0: dễ
  "opencode-go/glm-5.3"               # 1: vừa
  "opencode-go/kimi-k3.1-pro"         # 2: khó
)
LABELS=("dễ" "vừa" "khó")
VERIFY_MODEL="${VERIFY_MODEL:-opencode-go/gemini-4-argon}"

# ---------- giao diện ----------
if [[ -t 1 ]]; then
  BOLD=$'\e[1m'; DIM=$'\e[2m'; RED=$'\e[31m'; GREEN=$'\e[32m'
  YELLOW=$'\e[33m'; BLUE=$'\e[34m'; CYAN=$'\e[36m'; RESET=$'\e[0m'
else
  BOLD=""; DIM=""; RED=""; GREEN=""; YELLOW=""; BLUE=""; CYAN=""; RESET=""
fi
SPIN=("⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠏")

hr()    { echo "${DIM}────────────────────────────────────────────────────────${RESET}"; }
info()  { echo "${CYAN}$*${RESET}"; }
ok()    { echo "${GREEN}$*${RESET}"; }
warn()  { echo "${YELLOW}$*${RESET}"; }
fail()  { echo "${RED}$*${RESET}"; }

fmt_time() { printf "%dm%02ds" $(( $1 / 60 )) $(( $1 % 60 )); }

# In một mục của file task (bỏ dòng trống và comment), tối đa N dòng
section() {
  awk -v h="## $1" '
    $0 == h { f = 1; next }
    /^## / { f = 0 }
    f && NF && $0 !~ /^<!--/ { print }
  ' "$TASK" | head -n "${2:-4}"
}

# Chạy OpenCode: im lặng + spinner (mặc định) hoặc hiện hết (VERBOSE=1)
run_agent() {
  local model="$1" prompt="$2" title="$3"
  echo "" >> "$LOG"
  echo "=== $(date '+%F %T') · $title · $model ===" >> "$LOG"

  if [[ "$VERBOSE" == "1" ]]; then
    opencode run --model "$model" "$prompt" 2>&1 | tee -a "$LOG" || true
    return
  fi

  opencode run --model "$model" "$prompt" >> "$LOG" 2>&1 &
  local pid=$! start=$SECONDS i=0 last
  while kill -0 "$pid" 2>/dev/null; do
    last=$(git log -1 --format=%s 2>/dev/null | cut -c1-55)
    printf "\r  ${CYAN}%s${RESET} %s  ${DIM}commit mới nhất: %s${RESET}\033[K" \
      "${SPIN[$((i % 10))]}" "$(fmt_time $((SECONDS - start)))" "$last"
    i=$((i + 1))
    sleep 0.5
  done
  wait "$pid" || true
  printf "\r\033[K"
  LAST_DURATION=$((SECONDS - start))
}

# ---------- Verify ----------
verify() {
  echo ""
  hr
  echo "${BOLD}🔍 Verify trên trình duyệt${RESET}  ${DIM}$VERIFY_MODEL${RESET}"
  hr

  local prompt="Đọc AGENTS.md và $TASK. Toàn bộ các bước code đã xong.
Nhiệm vụ: kiểm tra tính năng vừa làm như một người chơi thật, bằng playwright-cli.
1. Chạy npx playwright test trước. Ghi kết quả từng test vào 'Test status'.
2. Đảm bảo dev server đang chạy (npm run dev). Dùng playwright-cli mở game tại
   http://localhost:5173/?test=1. Với tính năng 2 người chơi, mở 2 session riêng.
3. Kiểm tra từng ý trong 'Mục tiêu' và 'Test cases': thao tác, chụp màn hình,
   dùng window.__GAME__ để đọc/set state thay vì tự chơi.
4. Ghi vào file task mục '## Verify' gồm: từng ý đã kiểm tra, PASS/FAIL,
   đường dẫn screenshot, lỗi phát hiện.
5. Với MỖI kịch bản đã kiểm tra (kể cả PASS): viết thành test trong tests/ để lần sau chạy tự động,
   và thêm nó vào mục 'Test cases' nếu chưa có. Kịch bản FAIL thì test được phép fail.
   KHÔNG sửa code game.
6. Dòng cuối mục Verify phải là đúng 'VERIFY: PASS' hoặc 'VERIFY: FAIL'.
7. Dọn dẹp: đóng browser, dừng dev server nếu bạn đã bật. Commit file task và test mới."

  run_agent "$VERIFY_MODEL" "$prompt" "verify"
  info "  ⏱  $(fmt_time "${LAST_DURATION:-0}")"

  echo ""
  echo "${BOLD}Test status${RESET}"
  section "Test status" 8 | sed 's/^/  /'
  echo ""
  echo "${BOLD}Verify${RESET}"
  section "Verify" 12 | sed 's/^/  /'
  echo ""

  if grep -q '^VERIFY: PASS' "$TASK"; then
    ok "✅ Verify PASS. Tiếp theo: mở Claude → gõ review → nếu ổn gõ ship (squash + push)."
    return 0
  elif grep -q '^VERIFY: FAIL' "$TASK"; then
    fail "⛔ Verify FAIL. Mở Claude → gõ review để xem cách sửa."
    return 1
  else
    warn "⚠️  Agent không ghi kết quả Verify. Xem chi tiết: less -R $LOG"
    return 1
  fi
}

# ---------- kiểm tra đầu vào ----------
[[ -f "$TASK" ]] || { fail "Không thấy file task: $TASK"; exit 1; }

if [[ -n "$(git status --porcelain)" ]]; then
  fail "⚠️  Working tree đang có thay đổi chưa commit. Commit hoặc stash trước khi chạy."
  exit 1
fi

# Luôn làm trên nhánh task riêng, không commit từng bước lên main
branch=$(git rev-parse --abbrev-ref HEAD)
if [[ "$branch" == "main" || "$branch" == "master" ]]; then
  slug=$(basename "$TASK" .md | sed -E 's/^[0-9]{4}-[0-9]{2}-[0-9]{2}-//')
  branch="task/$slug"
  if git show-ref --quiet "refs/heads/$branch"; then
    git checkout -q "$branch"
  else
    git checkout -q -b "$branch"
  fi
  warn "↪  Đang ở main, chuyển sang nhánh $branch"
fi

total=$(grep -cE '^- \[[ x]\] [0-9]+\.' "$TASK" || true)
echo ""
echo "${BOLD}📋 $(head -n1 "$TASK" | sed 's/^# //')${RESET}"
echo "${DIM}$TASK · $total bước · nhánh $branch · chi tiết: tail -f $LOG${RESET}"

# ---------- vòng lặp các bước ----------
runs=0
last_step=""
level=1

while (( runs < MAX_RUNS )); do
  line=$(grep -m1 -E '^- \[ \] [0-9]+\.' "$TASK" || true)
  if [[ -z "$line" ]]; then
    echo ""
    ok "✅ Đã xong mọi bước code."
    set +e; verify; rc=$?; set -e
    exit $rc
  fi

  step=$(sed -E 's/^- \[ \] ([0-9]+)\..*/\1/' <<< "$line")
  desc=$(sed -E 's/^- \[ \] [0-9]+\. *(\[[^]]*\])? *//' <<< "$line" | cut -c1-90)

  if [[ "$step" != "$last_step" ]]; then
    case "$line" in
      *"[dễ]"*)  level=0 ;;
      *"[khó]"*) level=2 ;;
      *)         level=1 ;;
    esac
  else
    level=$((level + 1))
    if (( level > 2 )); then
      echo ""
      fail "⛔ Bước $step chưa xong sau khi đã thử tới model mạnh nhất."
      echo "${BOLD}Đã thử mà không được${RESET}"
      section "Đã thử mà không được" 6 | sed 's/^/  /'
      echo ""
      echo "Chuyển cho Claude, dán:"
      echo "  ${BOLD}Đọc $TASK và test-results/results.json. Tìm nguyên nhân bước $step và sửa.${RESET}"
      exit 1
    fi
    warn "  ↗  Leo thang bước $step lên [${LABELS[$level]}]"
  fi

  model="${MODELS[$level]}"
  last_step="$step"
  runs=$((runs + 1))

  echo ""
  hr
  echo "${BOLD}▶ Bước $step/$total${RESET}  ${BLUE}[${LABELS[$level]}]${RESET} ${DIM}${model#opencode-go/}${RESET}"
  echo "  $desc"

  prompt="Đọc AGENTS.md và $TASK. CHỈ làm bước $step, không làm bước khác.
Khi xong: chạy npm run typecheck và npx playwright test; commit với message rõ ràng;
tick checkbox của bước $step; cập nhật 'Trạng thái hiện tại' và 'Test status'.
Nếu sau 2 lần sửa vẫn fail: KHÔNG tick checkbox, ghi nguyên nhân và cách đã thử vào
'Đã thử mà không được', commit file task, rồi dừng."

  run_agent "$model" "$prompt" "bước $step"

  if grep -qE "^- \[x\] $step\." "$TASK"; then
    ok "  ✓ Xong · $(fmt_time "${LAST_DURATION:-0}") · $(git log -1 --format=%s | cut -c1-60)"
  else
    warn "  ✗ Chưa xong · $(fmt_time "${LAST_DURATION:-0}")"
  fi
done

warn "⏸  Đã chạm giới hạn $MAX_RUNS lần chạy. Kiểm tra file task và $LOG."
exit 1
