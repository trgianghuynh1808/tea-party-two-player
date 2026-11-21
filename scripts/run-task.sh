#!/usr/bin/env bash
# Chạy tự động các bước trong một file task bằng OpenCode, chọn model theo nhãn độ khó,
# rồi tự kiểm tra trên trình duyệt (Verify).
#
# Cách dùng:
#   scripts/run-task.sh .agents/tasks/<file>.md
#   VERBOSE=1 scripts/run-task.sh ...       # hiện toàn bộ output của OpenCode như cũ
#   REUSE_SESSION=0 scripts/run-task.sh ... # mỗi nhóm bước một phiên mới (không --continue)
#   BATCH_MAX=1 scripts/run-task.sh ...     # mỗi lần chạy chỉ 1 bước (như bản cũ)
#   ACTIONS=0 scripts/run-task.sh ...       # ẩn các dòng hành động, chỉ hiện commit
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
BATCH_MAX="${BATCH_MAX:-4}"          # tối đa số bước gom vào một lần chạy
REUSE_SESSION="${REUSE_SESSION:-1}"  # 1 = nối tiếp phiên OpenCode giữa các lần chạy (giữ context)
ACTIONS="${ACTIONS:-1}"              # 1 = hiện các hành động (sửa file, chạy lệnh) khi agent làm
# Dòng nào trong output của OpenCode được coi là "hành động" để hiện lên màn hình
DEFAULT_ACTION_REGEX='^[[:space:]]*(← |\$ |[|│][[:space:]]*(Edit|Write|Bash|Patch)[[:space:]])'
ACTION_REGEX="${ACTION_REGEX:-$DEFAULT_ACTION_REGEX}"
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

# Ghi từng dòng output vào log kèm giờ và số giây kể từ lúc bắt đầu lần chạy,
# đồng thời chuyển dòng gốc ra stdout. Phân tích chỗ chậm: scripts/log-gaps.sh
stamp_tee() {
  local t0=$SECONDS line
  while IFS= read -r line; do
    printf '%s +%ss │ %s\n' "$(date +%H:%M:%S)" "$((SECONDS - t0))" "$line" >> "$LOG"
    printf '%s\n' "$line"
  done
}

# Lọc output của OpenCode: chỉ hiện dòng hành động (sửa file, chạy lệnh)
# Đổi ACTION_REGEX nếu OpenCode in hành động theo định dạng khác (xem .agents/run.log)
action_feed() {
  local cols w line
  cols=$(tput cols 2>/dev/null || echo 80)
  w=$((cols - 8))
  while IFS= read -r line; do
    if [[ "$line" =~ $ACTION_REGEX ]]; then
      line="${line#"${line%%[![:space:]]*}"}"        # bỏ khoảng trắng đầu dòng
      (( ${#line} > w )) && line="${line:0:w}…"
      printf "\r\033[K    ${DIM}%s${RESET}\n" "$line"
    fi
  done
}

# In các commit mới kèm danh sách file đã sửa (mỗi commit chỉ in một lần)
print_new_commits() {
  local head c cols
  head=$(git rev-parse HEAD 2>/dev/null || echo none)
  [[ "$head" == "$SEEN" ]] && return 0
  cols=$(tput cols 2>/dev/null || echo 80)
  printf "\r\033[K"
  for c in $(git rev-list --reverse "$SEEN..$head" 2>/dev/null); do
    echo "  ${GREEN}●${RESET} $(git log -1 --format=%s "$c")"
    git show --stat=$((cols - 8)) --format= "$c" 2>/dev/null | sed '/^$/d' | sed '$d' \
      | sed "s/^/  ${DIM}/; s/\$/${RESET}/"
  done
  SEEN="$head"
}

# Chạy OpenCode: tóm tắt + spinner (mặc định) hoặc hiện hết (VERBOSE=1)
run_agent() {
  local model="$1" prompt="$2" title="$3" cont="${4:-0}"
  local args=(run --model "$model")
  [[ "$cont" == "1" ]] && args+=(--continue)
  echo "" >> "$LOG"
  echo "=== $(date '+%F %T') · $title · $model ===" >> "$LOG"

  if [[ "$VERBOSE" == "1" ]]; then
    opencode "${args[@]}" "$prompt" 2>&1 | stamp_tee || true
    return
  fi

  SEEN=$(git rev-parse HEAD 2>/dev/null || echo none)
  local start=$SECONDS i=0 pid

  if [[ "$ACTIONS" == "1" ]]; then
    ( opencode "${args[@]}" "$prompt" 2>&1 | stamp_tee | action_feed ) &
  else
    ( opencode "${args[@]}" "$prompt" 2>&1 | stamp_tee > /dev/null ) &
  fi
  pid=$!

  while kill -0 "$pid" 2>/dev/null; do
    print_new_commits
    # Dòng spinner ngắn để không bị xuống dòng (\r chỉ đè được 1 dòng)
    printf "\r  ${CYAN}%s${RESET} %s ${DIM}đang chạy…${RESET}\033[K" \
      "${SPIN[$((i % 10))]}" "$(fmt_time $((SECONDS - start)))"
    i=$((i + 1))
    sleep 0.5
  done
  wait "$pid" || true
  print_new_commits
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
# Gom các bước liên tiếp cùng nhãn thành MỘT lần chạy (một phiên OpenCode),
# để agent không phải đọc lại context từ đầu ở mỗi bước.
# Với REUSE_SESSION=1, các lần chạy sau còn nối tiếp phiên trước (--continue),
# nên context được giữ qua cả các nhóm bước.

level_of() {
  case "$1" in
    *"[dễ]"*)  echo 0 ;;
    *"[khó]"*) echo 2 ;;
    *)         echo 1 ;;
  esac
}

runs=0
failed_step=""     # bước vừa chạy mà chưa xong → lần sau leo thang
failed_level=0

while (( runs < MAX_RUNS )); do
  unchecked=$(grep -E '^- \[ \] [0-9]+\.' "$TASK" || true)
  if [[ -z "$unchecked" ]]; then
    echo ""
    ok "✅ Đã xong mọi bước code."
    set +e; verify; rc=$?; set -e
    exit $rc
  fi

  first_line=$(head -n1 <<< "$unchecked")
  first_step=$(sed -E 's/^- \[ \] ([0-9]+)\..*/\1/' <<< "$first_line")

  # Chọn mức model và các bước trong nhóm
  batch_steps=()
  batch_lines=()
  n=0
  if [[ "$first_step" == "$failed_step" ]]; then
    level=$((failed_level + 1))
    if (( level > 2 )); then
      echo ""
      fail "⛔ Bước $first_step chưa xong sau khi đã thử tới model mạnh nhất."
      echo "${BOLD}Đã thử mà không được${RESET}"
      section "Đã thử mà không được" 6 | sed 's/^/  /'
      echo ""
      echo "Chuyển cho Claude, dán:"
      echo "  ${BOLD}Đọc $TASK và test-results/results.json. Tìm nguyên nhân bước $first_step và sửa.${RESET}"
      exit 1
    fi
    warn "  ↗  Leo thang bước $first_step lên [${LABELS[$level]}]"
    batch_steps=("$first_step")
    batch_lines=("$first_line")
    n=1
  else
    level=$(level_of "$first_line")
    while IFS= read -r l; do
      if (( n >= BATCH_MAX )); then break; fi
      if [[ "$(level_of "$l")" != "$level" ]]; then break; fi
      batch_steps[n]=$(sed -E 's/^- \[ \] ([0-9]+)\..*/\1/' <<< "$l")
      batch_lines[n]="$l"
      n=$((n + 1))
    done <<< "$unchecked"
  fi

  model="${MODELS[$level]}"
  runs=$((runs + 1))
  steps_csv=$(IFS=,; echo "${batch_steps[*]}" | sed 's/,/, /g')
  if (( n == 1 )); then
    range="${batch_steps[0]}"
  else
    range="${batch_steps[0]}–${batch_steps[$((n - 1))]}"
  fi

  echo ""
  hr
  echo "${BOLD}▶ Bước $range/$total${RESET}  ${BLUE}[${LABELS[$level]}]${RESET} ${DIM}${model#opencode-go/}${RESET}"
  for l in "${batch_lines[@]}"; do
    echo "  $(sed -E 's/^- \[ \] ([0-9]+)\. *(\[[^]]*\])? */\1. /' <<< "$l" | cut -c1-90)"
  done

  prompt="Đọc AGENTS.md và $TASK. Làm LẦN LƯỢT các bước $steps_csv, không làm bước nào khác.
Sau MỖI bước: chạy npm run typecheck và các Playwright spec liên quan (nếu có);
commit với message rõ ràng; tick checkbox của bước đó; cập nhật 'Trạng thái hiện tại' và 'Test status'.
Nếu một bước sau 2 lần sửa vẫn fail: KHÔNG tick checkbox của bước đó, ghi nguyên nhân và cách đã thử vào
'Đã thử mà không được', commit file task, rồi DỪNG (không làm các bước sau)."

  continue_flag=0
  if [[ "$REUSE_SESSION" == "1" ]] && (( runs > 1 )); then
    continue_flag=1
  fi
  run_agent "$model" "$prompt" "bước $range" "$continue_flag"

  # Kết quả từng bước trong nhóm
  failed_step=""
  for s in "${batch_steps[@]}"; do
    if grep -qE "^- \[x\] $s\." "$TASK"; then
      ok "  ✓ Bước $s xong"
    elif [[ -z "$failed_step" ]]; then
      warn "  ✗ Bước $s chưa xong"
      failed_step="$s"
      failed_level=$level
    else
      echo "  ${DIM}– Bước $s chưa làm (dừng ở bước $failed_step)${RESET}"
    fi
  done
  info "  ⏱  $(fmt_time "${LAST_DURATION:-0}")"
done

warn "⏸  Đã chạm giới hạn $MAX_RUNS lần chạy. Kiểm tra file task và $LOG."
exit 1
