#!/usr/bin/env bash
# Chạy tự động các bước trong một file task bằng OpenCode, chọn model theo nhãn độ khó,
# rồi tự kiểm tra trên trình duyệt (Verify).
#
# Cách dùng:
#   scripts/run-task.sh .agents/tasks/<file>.md
#   VERBOSE=1 scripts/run-task.sh ...       # hiện toàn bộ output của OpenCode như cũ
#   REUSE_SESSION=0 scripts/run-task.sh ... # mỗi nhóm bước một phiên mới (không --continue)
#   (FRESH_RULES trong config: chỉ các bước khớp tiền tố, vd tests/, chạy phiên mới)
#   BATCH_MAX=1 scripts/run-task.sh ...     # mỗi lần chạy chỉ 1 bước (như bản cũ)
#   ACTIONS=0 scripts/run-task.sh ...       # ẩn các dòng hành động, chỉ hiện commit
#   VERIFY_MODE=full scripts/run-task.sh ...# none | light (mặc định) | full — ghi đè "Verify mode:" trong file task
#   VERIFY_AGENT=claude scripts/run-task.sh ...# để Claude làm Verify (tiết kiệm quota OpenCode)
#   AUTOPILOT=0|1 scripts/run-task.sh ...   # chỉ ảnh hưởng thông báo cuối: 1 = Claude đang chờ (Autopilot, watch-tasks.sh tự đặt),
#                                           #   0 = chạy tay, in hướng dẫn "mở Claude → /clear → gõ verify". Mặc định 0.
#
# Màn hình chỉ hiện tóm tắt. Chi tiết đầy đủ nằm trong .agents/run.log
#   (xem trực tiếp ở ô khác: tail -f .agents/run.log)
#
# Quy ước trong file task:  - [ ] N. [dễ|vừa|khó] ...
# Leo thang khi một bước chưa xong:  dễ → vừa → khó → dừng (chuyển Claude)
#
# Cấu hình cho từng project: .agents/config.sh (model, URL verify, lệnh kiểm tra...)

set -euo pipefail

# Mặc định — có thể ghi đè trong .agents/config.sh hoặc bằng biến môi trường
MODELS=(
  "opencode-go/deepseek-v4.1-flash"   # 0: dễ
  "opencode-go/glm-5.3"               # 1: vừa
  "opencode-go/kimi-k3.1-pro"         # 2: khó
)
# Mức [vừa] chọn model theo thư mục của file đầu tiên trong bước ("tiền tố=model").
# Không khớp quy tắc nào thì dùng MODELS[1]. Để trống = luôn dùng MODELS[1].
MEDIUM_RULES=()
# Bước có file đầu tiên khớp một tiền tố ở đây luôn chạy trong PHIÊN MỚI (không --continue), để context không phình
# theo các bước trước (mỗi lượt gọi model chậm dần khi phiên dài). Plan phải tự mang đủ ngữ cảnh. Để trống = nối tiếp như thường.
FRESH_RULES=()
DEFAULT_VERIFY_MODEL="opencode-go/gemini-4-argon"
DEFAULT_VERIFY_URL="http://localhost:5173"
DEFAULT_CHECK_HINT="lệnh typecheck/lint và các test liên quan theo mục Commands trong AGENTS.md"
DEFAULT_VERIFY_HINT=""
DEFAULT_VERIFY_AGENT="claude"     # claude = Claude Verify (Autopilot) · opencode = OpenCode tự Verify ngay sau khi code xong

# A headless OpenCode run cannot answer a permission prompt, so a step that touches a path outside the project (e.g. a file in /tmp)
# stalls until it is rejected. Allow the system temp folders up front; an OPENCODE_PERMISSION you set yourself wins.
if [[ -z "${OPENCODE_PERMISSION:-}" ]]; then
  OPENCODE_PERMISSION='{"external_directory":{"/tmp/*":"allow","/private/tmp/*":"allow","/var/folders/*":"allow"}}'
fi
export OPENCODE_PERMISSION

CONFIG=".agents/config.sh"
# shellcheck source=/dev/null
if [[ -f "$CONFIG" ]]; then source "$CONFIG"; fi

# Cấu hình phòng (.agents/room.env): port/URL riêng từng project, nhánh staging. Không có file thì bỏ qua.
# shellcheck source=/dev/null
[[ -f scripts/room-env.sh ]] && source scripts/room-env.sh
# Giữ nguyên path/query của DEFAULT_VERIFY_URL (vd ?test=1), chỉ thay port theo phòng
if [[ -n "${APP_PORT:-}" ]]; then
  DEFAULT_VERIFY_URL="$(sed -E "s#(://[^/:]+)(:[0-9]+)?#\1:$APP_PORT#" <<<"$DEFAULT_VERIFY_URL")"
fi

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

LABELS=("dễ" "vừa" "khó")
VERIFY_MODEL="${VERIFY_MODEL:-$DEFAULT_VERIFY_MODEL}"
VERIFY_URL="${VERIFY_URL:-$DEFAULT_VERIFY_URL}"
CHECK_HINT="${CHECK_HINT:-$DEFAULT_CHECK_HINT}"
VERIFY_HINT="${VERIFY_HINT:-$DEFAULT_VERIFY_HINT}"
VERIFY="${VERIFY:-1}"                  # 0 = bỏ qua bước Verify trên trình duyệt
VERIFY_AGENT="${VERIFY_AGENT:-$DEFAULT_VERIFY_AGENT}"
AUTOPILOT="${AUTOPILOT:-0}"            # 1 = chạy qua watch-tasks.sh (Claude đang chờ bằng wait-task.sh)

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

# Báo ra Telegram (vai Senior Dev) qua .agents/outbox khi project là một phòng (có room.env); không thì bỏ qua.
# room-ops.py lo định dạng, cắt chữ và đặt tên file (nano giây) để bridge gửi đúng thứ tự giữa các vai.
OPS_PY=".agents/bin/room-ops.py"; [[ -f "$OPS_PY" ]] || OPS_PY="scripts/room-ops.py"
say_dev() {
  [[ -f .agents/room.env && -f "$OPS_PY" ]] || return 0
  python3 "$OPS_PY" say dev "$1" >/dev/null 2>&1 || true
}
say_dev_steps() {   # tiêu đề, rồi các dòng bước trong plan
  [[ -f .agents/room.env && -f "$OPS_PY" ]] || return 0
  python3 "$OPS_PY" say-steps dev "$@" >/dev/null 2>&1 || true
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
  local mode="$1"
  echo ""
  hr
  echo "${BOLD}🔍 Verify ${mode} trên trình duyệt${RESET}  ${DIM}$VERIFY_MODEL${RESET}"
  hr

  local prompt common
  common="Đọc AGENTS.md và $TASK. Toàn bộ các bước code đã xong. KHÔNG sửa code của app.
Dev server: xem AGENTS.md. App tại $VERIFY_URL. Nếu AGENTS.md mô tả test hook để set state, dùng nó.
$VERIFY_HINT
$SAFETY_RULES
Nếu 'Trạng thái hiện tại' có dòng 'Selectors:', dùng nó thay vì grep code.
$NOTES_RULES"

  if [[ "$mode" == "full" ]]; then
    prompt="$common
Nhiệm vụ (Verify FULL): kiểm tra tính năng như một người dùng thật, bằng playwright-cli.
1. Chạy toàn bộ e2e test một lần. Ghi kết quả từng test vào 'Test status'.
2. Mở app bằng playwright-cli (tính năng nhiều người dùng: nhiều session).
3. Kiểm tra từng ý trong 'Mục tiêu' và 'Test cases', thêm tối đa 2 kịch bản biên quan trọng nhất. Chụp màn hình.
4. Ghi mục '## Verify': từng ý, PASS/FAIL, đường dẫn screenshot, lỗi phát hiện.
5. Viết test cho các kịch bản CHƯA có spec (kể cả PASS), tối đa 3 test mới. Kịch bản FAIL thì test được phép fail.
6. Dòng cuối mục Verify phải là đúng 'VERIFY: PASS' hoặc 'VERIFY: FAIL'.
7. Dọn dẹp: đóng browser, dừng dev server nếu bạn đã bật. Commit file task và test mới."
  else
    prompt="$common
Nhiệm vụ (Verify LIGHT, làm nhanh, không suy luận thêm kịch bản):
1. Chạy toàn bộ e2e test một lần. Ghi kết quả từng test vào 'Test status'.
2. Chỉ mở playwright-cli cho các ý trong 'Test cases' mà spec KHÔNG kiểm tra được (thường là hình ảnh/bố cục):
   mỗi ý 1 screenshot. Ý nào spec đã PASS thì coi là PASS, không mở trình duyệt.
3. KHÔNG nghĩ thêm kịch bản mới. Chỉ viết test mới nếu phát hiện lỗi (tối đa 1 test tái hiện lỗi đó).
4. Ghi mục '## Verify' ngắn gọn: từng ý, PASS/FAIL, screenshot (nếu có).
5. Dòng cuối mục Verify phải là đúng 'VERIFY: PASS' hoặc 'VERIFY: FAIL'.
6. Dọn dẹp: đóng browser, dừng dev server nếu bạn đã bật. Commit file task (và test mới nếu có)."
  fi

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
    if [[ "$AUTOPILOT" == "1" ]]; then
      ok "✅ Verify PASS. Claude sẽ tự review và ship."
    else
      ok "✅ Verify PASS. Tiếp theo: mở Claude → gõ review → nếu ổn gõ ship (squash + push)."
    fi
    return 0
  elif grep -q '^VERIFY: FAIL' "$TASK"; then
    if [[ "$AUTOPILOT" == "1" ]]; then
      fail "⛔ Verify FAIL. Claude sẽ tự xử lý."
    else
      fail "⛔ Verify FAIL. Mở Claude → gõ review để xem cách sửa."
    fi
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
if [[ "$branch" == "main" || "$branch" == "master" || "$branch" == "${MAIN_BRANCH:-main}" || "$branch" == "${STAGING_BRANCH:-staging}" ]]; then
  slug=$(basename "$TASK" .md | sed -E 's/^[0-9]{4}-[0-9]{2}-[0-9]{2}-//')
  branch="task/$slug"
  if git show-ref --quiet "refs/heads/$branch"; then
    git checkout -q "$branch"
  else
    git checkout -q -b "$branch"
  fi
  warn "↪  Đang ở nhánh chính/staging, chuyển sang nhánh $branch"
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

# Quy tắc gửi kèm MỌI prompt của OpenCode (bước code và Verify)
# Lần T05 (tea-party): OpenCode thấy dev server của người dùng thiếu ADMIN_TOKEN và tự kill nó, khiến server dev bật tắt liên tục.
SAFETY_RULES="AN TOÀN VỚI TIẾN TRÌNH: KHÔNG kill, restart hay dừng bất kỳ tiến trình nào bạn không tự khởi động, nhất là dev server đang nghe cổng của người dùng (lsof và ps chỉ để xem, không để kill).
Nếu cổng bị chiếm bởi server không phù hợp (thiếu biến môi trường như ADMIN_TOKEN, sai cấu hình), KHÔNG kill: ghi vào 'Đã thử mà không được' cổng, PID và lý do không phù hợp, không tick bước, commit file task rồi DỪNG để Tech Lead xử lý."
SELECTOR_RULES="SELECTOR CHO BƯỚC TEST: nếu bước này tạo hoặc đổi giao diện (id, class, data-*, nút, input, route mới), cuối bước hãy ghi vào 'Trạng thái hiện tại' MỘT dòng 'Selectors: ...' liệt kê các selector chính kèm file chứa chúng (ví dụ 'Selectors: #customFile, #analyzeBtn, .cd-candidate (server/portal/index.html)').
Nếu bước này là bước viết test cho giao diện đã có: ĐỌC dòng 'Selectors:' trong 'Trạng thái hiện tại' TRƯỚC, chỉ grep code khi còn thiếu selector."

NOTES_RULES="LƯU Ý CHO NGƯỜI DUYỆT: khi có điều người duyệt cần biết thì ghi một dòng bắt đầu bằng 'Lưu ý:' vào 'Trạng thái hiện tại' (hoặc vào mục '## Lưu ý' nếu file task có). Ví dụ: chỗ làm lệch plan, phần chưa được kiểm tra hoặc kiểm tra ít hơn mục tiêu, bug đã biết (kể cả test đánh dấu test.fail), việc nên làm tiếp, phát hiện không chặn khi review. Hệ thống chuyển những dòng này lên Telegram; chỉ dòng có tiền tố 'Lưu ý:' hoặc 'Cảnh báo:' mới được chuyển."

# Đường dẫn file đầu tiên nhắc tới trong dòng bước (vd client/src/ui/OrdersPanel.ts)
first_path_of() {
  grep -oE '[A-Za-z0-9_.@-]+/[A-Za-z0-9_./@-]+' <<< "$1" | head -n1 || true
}

# Model cho một bước ở một mức. Mức [vừa] có thể chọn theo thư mục qua MEDIUM_RULES.
# 1 nếu bước thuộc FRESH_RULES (cần phiên mới), 0 nếu không.
fresh_session_for() {
  local path rule
  path=$(first_path_of "$1")
  for rule in "${FRESH_RULES[@]}"; do
    if [[ -n "$path" && "$path" == "$rule"* ]]; then
      echo 1
      return
    fi
  done
  echo 0
}

model_for() {
  local line="$1" lvl="$2" path rule prefix
  if [[ "$lvl" == "1" && ${#MEDIUM_RULES[@]} -gt 0 ]]; then
    path=$(first_path_of "$line")
    for rule in "${MEDIUM_RULES[@]}"; do
      prefix="${rule%%=*}"
      if [[ -n "$path" && "$path" == "$prefix"* ]]; then
        echo "${rule#*=}"
        return
      fi
    done
  fi
  echo "${MODELS[$lvl]}"
}

runs=0
failed_step=""     # bước vừa chạy mà chưa xong → lần sau leo thang
failed_level=0
failed_model=""

while (( runs < MAX_RUNS )); do
  unchecked=$(grep -E '^- \[ \] [0-9]+\.' "$TASK" || true)
  if [[ -z "$unchecked" ]]; then
    echo ""
    ok "✅ Đã xong mọi bước code."
    # Mức Verify: biến môi trường VERIFY_MODE > dòng "Verify mode: ..." trong file task > light
    mode="${VERIFY_MODE:-$(grep -m1 -oE 'Verify mode: *(none|light|full)' "$TASK" | sed -E 's/.*: *//' || true)}"
    mode="${mode:-light}"
    if [[ "$VERIFY" != "1" || "$mode" == "none" ]]; then
      if [[ "$AUTOPILOT" == "1" ]]; then
        ok "   (Verify mode: none) Claude sẽ tự review."
      else
        ok "   (Verify mode: none) Tiếp theo: mở Claude → gõ review."
      fi
      exit 0
    fi
    if [[ "$VERIFY_AGENT" == "claude" ]]; then
      if [[ "$AUTOPILOT" == "1" ]]; then
        ok "   Đã xong, Claude sẽ tự verify ($mode) + review."
      else
        ok "   Verify $mode giao cho Claude. Tiếp theo: mở Claude → /clear → gõ verify (Claude verify + review luôn)."
      fi
      exit 0
    fi
    set +e; verify "$mode"; rc=$?; set -e
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
    # Bỏ qua mức có cùng model với lần vừa thất bại (chạy lại y hệt là phí)
    while (( level <= 2 )) && [[ "$(model_for "$first_line" "$level")" == "$failed_model" ]]; do
      level=$((level + 1))
    done
    if (( level > 2 )); then
      echo ""
      fail "⛔ Bước $first_step chưa xong sau khi đã thử tới model mạnh nhất."
      say_dev "Huhu, bước **$first_step** vẫn chưa xong dù mình đã gọi model mạnh nhất 😭 Nhờ Tech Lead xem giúp nha."
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
    batch_model=$(model_for "$first_line" "$level")
    while IFS= read -r l; do
      if (( n >= BATCH_MAX )); then break; fi
      if [[ "$(level_of "$l")" != "$level" ]]; then break; fi
      if [[ "$(model_for "$l" "$level")" != "$batch_model" ]]; then break; fi
      batch_steps[n]=$(sed -E 's/^- \[ \] ([0-9]+)\..*/\1/' <<< "$l")
      batch_lines[n]="$l"
      n=$((n + 1))
    done <<< "$unchecked"
  fi

  model=$(model_for "$first_line" "$level")
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

  if [[ "$first_step" == "$failed_step" ]]; then
    # ghi lại lần leo thang model: thẻ duyệt ship báo "N lần leo thang"
    if [[ -f .agents/room.env ]]; then
      mkdir -p .agents/progress
      echo "$first_step $model" >> ".agents/progress/$(basename "$TASK" .md | sed -E 's/^[0-9]{4}-[0-9]{2}-[0-9]{2}-//').esc"
    fi
    say_dev_steps "Bước **$range/$total** hơi khó nhằn, mình gọi model mạnh hơn hỗ trợ nha 💪 mức **${LABELS[$level]}** · model \`${model#opencode-go/}\`" "${batch_lines[@]}"
  fi
  prompt="Đọc AGENTS.md và $TASK. Làm LẦN LƯỢT các bước $steps_csv, không làm bước nào khác.
Sau MỖI bước: chạy $CHECK_HINT.
Về test: nếu bước có ghi lệnh test cụ thể thì CHỈ chạy đúng lệnh đó (không chạy cả bộ test);
KHÔNG tự nghĩ thêm hay viết thêm test ngoài những gì plan yêu cầu. Sau đó
commit với message rõ ràng; tick checkbox của bước đó; cập nhật 'Trạng thái hiện tại' và 'Test status'.
Nếu một bước sau 2 lần sửa vẫn fail: KHÔNG tick checkbox của bước đó, ghi nguyên nhân và cách đã thử vào
'Đã thử mà không được', commit file task, rồi DỪNG (không làm các bước sau).
$SAFETY_RULES
$SELECTOR_RULES
$NOTES_RULES"

  continue_flag=0
  if [[ "$REUSE_SESSION" == "1" ]] && (( runs > 1 )) && [[ "$(fresh_session_for "$first_line")" == "0" ]]; then
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
      failed_model="$model"
    else
      echo "  ${DIM}– Bước $s chưa làm (dừng ở bước $failed_step)${RESET}"
    fi
  done
  info "  ⏱  $(fmt_time "${LAST_DURATION:-0}")"
done

warn "⏸  Đã chạm giới hạn $MAX_RUNS lần chạy. Kiểm tra file task và $LOG."
exit 1
