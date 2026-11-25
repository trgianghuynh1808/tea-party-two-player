#!/usr/bin/env bash
# Daemon của một phòng: chạy ở thư mục gốc project (agent-room start gọi script này).
# Mỗi vòng quyết định MỘT việc rồi làm; việc cứng chạy bằng code (scripts/room-ops.py), Claude chỉ được gọi khi cần phán đoán.
#
#   inbox có tin            → room-ops.py xử lý (/status /stop /resume /ship /usage /auto, tin thường)
#                             Claude Manager chỉ khi: AUTO_SPLIT="claude" (/auto) hoặc CHAT_WITH_CLAUDE="true" (tin thường)
#   AUTO_MODE=true, task đầu tiên chưa xong:
#     [pending]             → Tech Lead (Claude) lên plan, không handoff
#     [plan_ready]          → room-ops.py check-plan: OK → tự duyệt + handoff · BLOCK → chặn · REVIEW → Claude Manager xem
#     [in_progress]         → daemon TỰ CHỜ OpenCode (đọc .agents/status); khi done/stuck mới gọi Tech Lead (verify, review, merge / fix)
#     tất cả [done]         → room-ops.py finalize (báo cáo, xin /ship), không gọi Claude
#   [BLOCKED]               → tắt AUTO_MODE, báo user
#
# Chặn vòng lặp vô hạn: cùng một (task, trạng thái) mà sau 2 lần gọi vẫn không đổi → tắt AUTO_MODE và báo user.
# Biến (đặt trong .agents/room.env hoặc môi trường):
#   POLL (giây, mặc định 3) · CLAUDE_FLAGS (mặc định --dangerously-skip-permissions)
#   MODEL_MANAGER, MODEL_TECHLEAD (alias haiku|sonnet|opus hoặc id; trống = mặc định của claude)
#   MAX_TURNS_MANAGER (20), MAX_TURNS_TECHLEAD (150)

set -uo pipefail

ROOM_DIR="$(pwd)"
AG=".agents"
BOARD="$AG/board.md"
INBOX="$AG/inbox"
OUTBOX="$AG/outbox"
LOGDIR="$AG/logs"
LOCK="$AG/manager.lock"
SIG="$AG/manager.sig"
ACTIVITY="$LOGDIR/activity.log"   # log gộp, có màu và giờ — cửa sổ dashboard của agent-room đọc file này
OPS="scripts/room-ops.py"
POLL="${POLL:-3}"
CLAUDE_FLAGS="${CLAUDE_FLAGS:---dangerously-skip-permissions}"
MANAGER_PROMPT="${MANAGER_PROMPT:-$AG/MANAGER.md}"
[[ -f "$MANAGER_PROMPT" ]] || MANAGER_PROMPT="prompts/MANAGER.md"

[[ -f "$AG/room.env" ]] || { echo "⛔ Không thấy $AG/room.env — chạy: scripts/agent-room.sh init --topic <ID> --port <PORT>"; exit 1; }
[[ -f "$MANAGER_PROMPT" ]] || { echo "⛔ Không thấy prompt Manager ($MANAGER_PROMPT)"; exit 1; }
[[ -f "$OPS" ]] || { echo "⛔ Không thấy $OPS — chạy lại install.sh"; exit 1; }
command -v claude >/dev/null || { echo "⛔ Chưa cài claude CLI"; exit 1; }
command -v python3 >/dev/null || { echo "⛔ Chưa cài python3"; exit 1; }
mkdir -p "$INBOX/processed" "$INBOX/failed" "$OUTBOX" "$LOGDIR" "$AG/screenshots" "$AG/tasks" "$AG/status"

# Một daemon mỗi phòng
if [[ -f "$LOCK" ]] && kill -0 "$(cat "$LOCK" 2>/dev/null)" 2>/dev/null; then
  echo "⛔ Manager của phòng này đã chạy (pid $(cat "$LOCK"))."; exit 1
fi
echo $$ > "$LOCK"
trap 'rm -f "$LOCK"; exit 0' INT TERM EXIT

c_role() { case "$1" in manager) printf '\033[36m' ;; techlead) printf '\033[33m' ;; *) printf '\033[90m' ;; esac; }
log() {
  printf '[%s] %s\n' "$(date '+%F %T')" "$*" >> "$LOGDIR/manager.log"
  printf '\033[90m%s\033[0m %s\n' "$(date +%H:%M:%S)" "$*" | tee -a "$ACTIVITY"
}

say_user() {   # text [role] — ghi một tin ra outbox (room-ops.py ghi tạm rồi đổi tên; tên file là số ns nên giữ đúng thứ tự)
  python3 "$OPS" say "${2:-manager}" "$1" >/dev/null 2>&1 || true
}

room_env() {   # nạp lại mỗi vòng để thấy thay đổi mới
  # shellcheck source=/dev/null
  source "$AG/room.env"
  AUTO_MODE="${AUTO_MODE:-false}"; STAGING_BRANCH="${STAGING_BRANCH:-staging}"; MAIN_BRANCH="${MAIN_BRANCH:-main}"
  MAX_FIX_CYCLES="${MAX_FIX_CYCLES:-2}"
  MODEL_MANAGER="${MODEL_MANAGER:-}"; MODEL_TECHLEAD="${MODEL_TECHLEAD:-}"
  MAX_TURNS_MANAGER="${MAX_TURNS_MANAGER:-20}"; MAX_TURNS_TECHLEAD="${MAX_TURNS_TECHLEAD:-150}"
}

set_env_key() { # key value
  if grep -q "^$1=" "$AG/room.env"; then
    sed -i.bak -E "s|^$1=.*|$1=\"$2\"|" "$AG/room.env" && rm -f "$AG/room.env.bak"
  else
    echo "$1=\"$2\"" >> "$AG/room.env"
  fi
}

board_line() { grep -m1 -E '^- \[ \] `T[0-9]+` \[[A-Za-z_]+\]' "$BOARD" 2>/dev/null || true; }
line_id()    { sed -nE 's/^- \[ \] `(T[0-9]+)`.*/\1/p' <<<"$1"; }
line_state() { sed -nE 's/^- \[ \] `T[0-9]+` \[([A-Za-z_]+)\].*/\1/p' <<<"$1"; }
line_slug()  { sed -nE 's/.*\(slug: `([^`]+)`\).*/\1/p' <<<"$1"; }
has_done()   { grep -qE '^- \[x\] `T[0-9]+` \[done\]' "$BOARD" 2>/dev/null; }
watcher_alive() { [[ -f "$AG/watcher.pid" ]] && kill -0 "$(cat "$AG/watcher.pid" 2>/dev/null)" 2>/dev/null; }

run_claude() { # vai(manager|techlead) prompt [nhãn]
  local role="$1" label="${3:-$1}" col model turns raw text crc prc rc
  col="$(c_role "$role")"
  if [[ "$role" == techlead ]]; then model="$MODEL_TECHLEAD"; turns="$MAX_TURNS_TECHLEAD"; else model="$MODEL_MANAGER"; turns="$MAX_TURNS_MANAGER"; fi
  local args=(-p "$2" --output-format json --max-turns "$turns")
  [[ -n "$model" ]] && args+=(--model "$model")

  log "▶ ${role}: ${label}${model:+ [$model]}"
  [[ "$role" == techlead ]] && say_user "▶ $label" techlead
  printf '\n━━ %s ━━ %s\n' "$(date '+%F %T')" "$label" >> "$LOGDIR/$role.log"

  # shellcheck disable=SC2086
  raw="$(claude "${args[@]}" $CLAUDE_FLAGS 2>>"$LOGDIR/$role.err")"; crc=$?
  text="$(printf '%s' "$raw" | python3 "$OPS" claude-result "$role" "$label" "$model")"; prc=$?
  while IFS= read -r l; do
    printf '%s\n' "$l" >> "$LOGDIR/$role.log"
    [[ -z "${l//[[:space:]]/}" ]] && continue
    printf '%s %s%-9s\033[0m %s\n' "$(date +%H:%M:%S)" "$col" "$role" "$l" >> "$ACTIVITY"
  done <<<"$text"

  rc=0; (( crc != 0 )) && rc=$crc; (( rc == 0 && prc != 0 )) && rc=$prc
  if (( rc == 0 )); then
    log "✔ ${role}: ${label}"
    [[ "$role" == techlead ]] && say_user "✔ $label" techlead
  else
    log "⚠ ${role}: ${label} thoát với mã $rc"
    [[ "$role" == techlead ]] && say_user "⚠ $label thất bại (mã $rc). Xem .agents/logs/techlead.log" techlead
  fi
  return $rc
}

manager_prompt() { # MODE extra
  printf '%s\n\n---\nMODE: %s\nProject root: %s\n%s\n' "$(cat "$MANAGER_PROMPT")" "$1" "$ROOM_DIR" "${2:-}"
}

techlead_prompt() { # phase id slug [opencode-status plan-file]
  local common="Bạn là Tech Lead (Claude Code) trong phòng tự động (AUTO_MODE=true). Làm theo CLAUDE.md, mục Autopilot/AUTO_MODE.
Nhánh nền là '$STAGING_BRANCH' (không phải $MAIN_BRANCH). Task: $2, slug: $3 (xem tiêu đề trên .agents/board.md).
Không hỏi người dùng, không dừng chờ input. Gặp việc không làm được: đặt task thành [BLOCKED] trên board.md, ghi lý do vào Activity Log, rồi dừng.
Ngoài tin mốc daemon tự gửi, hãy báo kết quả quan trọng cho user bằng cách ghi MỘT file JSON vào .agents/outbox/ (ghi ra file .tmp rồi đổi tên thành <unix-ts>-techlead-<n>.json): {\"from\": \"techlead\", \"text\": \"<tối đa 4 dòng tiếng Việt>\", \"images\": [\"đường/dẫn/tương/đối.png\"]} (images không bắt buộc). Báo khi: plan xong (tiêu đề + số bước), kết quả Verify (PASS/FAIL kèm 1-3 ảnh), đã merge vào staging, hoặc BLOCKED. Không đưa secret vào tin."
  case "$1" in
    plan) printf '%s\n\nVIỆC CỦA BẠN: chỉ LÊN PLAN. Checkout %s, tạo nhánh task/%s, viết plan vào .agents/tasks/<ngày>-%s.md theo CLAUDE.md, commit file plan. KHÔNG chạy scripts/handoff.sh (daemon kiểm tra plan rồi mới giao). Cuối cùng đổi task %s trên board.md từ [pending] sang [plan_ready].\n' "$common" "$STAGING_BRANCH" "$3" "$3" "$2" ;;
    finish) printf '%s\n\nVIỆC CỦA BẠN: plan đã được duyệt và đã giao cho OpenCode. Daemon đã chờ giúp bạn: OpenCode báo trạng thái "%s" cho file plan %s. TUYỆT ĐỐI không chạy scripts/wait-task.sh. Làm tiếp từ bước Verify của Autopilot (nếu trạng thái done) hoặc Fix cycle (nếu stuck), tối đa %s vòng sửa.\nNếu cần Fix cycle: ghi bước Fix vào file plan, commit plan(fix-n), chạy scripts/handoff.sh <file plan> rồi KẾT THÚC phiên ngay: daemon sẽ chờ OpenCode và gọi lại bạn với ngữ cảnh mới (mọi thông tin phải nằm trong file plan).\nLưu ảnh verify vào .agents/screenshots/. Khi PASS: merge --squash nhánh task/%s vào %s (KHÔNG push, KHÔNG merge vào %s), xóa nhánh task, đổi task %s thành [done] và [x] trên board.md, ghi Activity Log. Nếu hết vòng sửa mà chưa đạt: [BLOCKED] + lý do.\n' "$common" "${4:-done}" "${5:-?}" "${MAX_FIX_CYCLES:-2}" "$3" "$STAGING_BRANCH" "$MAIN_BRANCH" "$2" ;;
  esac
}

# Trả về 0 nếu được phép thử tiếp; 1 nếu đã thử 2 lần mà trạng thái không đổi (và đã tắt AUTO_MODE)
guard() { # key
  local last="" n=0
  [[ -f "$SIG" ]] && read -r last n < "$SIG"
  if [[ "$last" == "$1" ]]; then n=$((n + 1)); else n=1; fi
  echo "$1 $n" > "$SIG"
  if (( n > 2 )); then
    set_env_key AUTO_MODE false
    log "⛔ $1 không tiến triển sau 2 lần — tắt AUTO_MODE"
    say_user "⛔ Phòng bị kẹt ở '$1' (đã thử 2 lần, trạng thái không đổi). Đã tắt AUTO_MODE. Xem .agents/logs/. Gõ /resume để chạy lại."
    rm -f "$SIG"
    return 1
  fi
  return 0
}

handle_inbox() {
  local files=() claude_files=() f rc summary listing=""
  while IFS= read -r f; do files+=("$f"); done < <(ls -1 "$INBOX"/*.json 2>/dev/null | sort)
  (( ${#files[@]} )) || return 1
  for f in "${files[@]}"; do
    summary="$(python3 "$OPS" inbox "$f" 2>>"$LOGDIR/ops.log")"; rc=$?
    case $rc in
      0) mv "$f" "$INBOX/processed/"; log "⚙ ${summary:-lệnh} (không dùng Claude)" ;;
      3) claude_files+=("$f") ;;
      *) mv "$f" "$INBOX/failed/"; log "⚠ lỗi khi xử lý $(basename "$f") (xem ops.log)"
         say_user "⚠️ Lỗi khi xử lý tin nhắn (xem .agents/logs/ops.log). Tin đã chuyển sang inbox/failed/." ;;
    esac
  done
  if (( ${#claude_files[@]} )); then
    for f in "${claude_files[@]}"; do listing+="- $f"$'\n'; done
    if run_claude manager "$(manager_prompt INBOX "Tin nhắn cần xử lý (đọc từng file):"$'\n'"$listing")" "xử lý tin nhắn (${#claude_files[@]})"; then
      mv "${claude_files[@]}" "$INBOX/processed/"
    else
      mv "${claude_files[@]}" "$INBOX/failed/"
      say_user "⚠️ Manager lỗi khi xử lý tin nhắn (xem .agents/logs/manager.log). Tin đã chuyển sang inbox/failed/."
    fi
  fi
  return 0
}

tick_auto() {
  room_env
  [[ "$AUTO_MODE" == "true" ]] || return 1
  local line id state slug plan st st_state st_ts fixes verdict
  line="$(board_line)"
  if [[ -z "$line" ]]; then
    # Không còn task chưa xong: có task done → chốt batch (bằng code, không gọi Claude)
    if has_done; then
      log "⚙ chốt batch, báo cáo xin duyệt ship"
      python3 "$OPS" finalize >/dev/null 2>>"$LOGDIR/ops.log" || {
        set_env_key AUTO_MODE false; say_user "⛔ Không tạo được báo cáo chốt batch (xem ops.log). Đã tắt AUTO_MODE."; }
      return 0
    fi
    return 1
  fi
  id="$(line_id "$line")"; state="$(line_state "$line")"; slug="$(line_slug "$line")"
  case "$state" in
    pending)
      # Tiền đề: watcher OpenCode phải sống trước khi bắt đầu task (không thì hand-off sẽ treo ở 'queued')
      if ! watcher_alive; then
        set_env_key AUTO_MODE false
        say_user "⛔ Senior Dev watcher (OpenCode) không chạy nên chưa bắt đầu $id. Đã tắt AUTO_MODE. Chạy scripts/agent-room.sh start rồi /resume. Dùng /health để kiểm tra."
        log "⛔ preflight: watcher không chạy — tắt AUTO_MODE"
        return 0
      fi
      guard "$id:$state" && run_claude techlead "$(techlead_prompt plan "$id" "$slug")" "$id lên plan" ;;
    plan_ready)
      guard "$id:$state" || return 0
      verdict="$(python3 "$OPS" check-plan "$slug" 2>>"$LOGDIR/ops.log")"
      log "⚙ $id kiểm tra plan: $verdict"
      case "$verdict" in
        OK) python3 "$OPS" approve "$slug" >>"$LOGDIR/ops.log" 2>&1 \
              && say_user "✅ $id: plan hợp lệ, đã tự duyệt và giao OpenCode." \
              || log "⚠ $id: duyệt/hand-off lỗi (task đã được đánh dấu BLOCKED, xem ops.log)" ;;
        BLOCK*) python3 "$OPS" block "$id" "${verdict#BLOCK: }" >/dev/null 2>>"$LOGDIR/ops.log" ;;
        *) run_claude manager "$(manager_prompt APPROVE_PLAN "Task: $id (slug: $slug)"$'\n'"Kiểm tra tự động nghi ngờ: ${verdict#REVIEW: }")" "$id duyệt plan" ;;
      esac ;;
    in_progress)
      plan="$(python3 "$OPS" plan-path "$slug" 2>>"$LOGDIR/ops.log")"
      st=""; [[ -n "$plan" ]] && st="$AG/status/$(basename "$plan" .md).status"
      st_state="none"; st_ts=0
      [[ -n "$st" && -f "$st" ]] && read -r st_state st_ts < "$st"
      case "$st_state" in
        queued|running)
          # Daemon tự chờ OpenCode; chỉ báo động nếu job nằm 'queued' lâu mà watcher đã chết
          if [[ "$st_state" == queued ]] && (( $(date +%s) - ${st_ts:-0} > 180 )); then
            set_env_key AUTO_MODE false
            if watcher_alive; then
              say_user "⛔ $id 'queued' hơn 3 phút dù watcher đang chạy: job có thể đã bị bỏ qua (xem pane watcher/OpenCode, nhánh git hiện tại). Đã tắt AUTO_MODE."
            else
              say_user "⛔ $id 'queued' hơn 3 phút và watcher OpenCode không chạy. Đã tắt AUTO_MODE. Chạy scripts/agent-room.sh start rồi /resume."
            fi
            log "⛔ $id queued quá lâu — tắt AUTO_MODE"
          fi
          return 1 ;;
      esac
      fixes="$(git log --oneline "$STAGING_BRANCH..task/$slug" --grep 'plan(fix-' 2>/dev/null | wc -l | tr -d ' ')"
      guard "$id:$st_state:$fixes" && run_claude techlead "$(techlead_prompt finish "$id" "$slug" "$st_state" "$plan")" "$id verify, review, merge" ;;
    BLOCKED)
      set_env_key AUTO_MODE false
      say_user "⛔ Task $id ($slug) đang BLOCKED. Đã tắt AUTO_MODE. Xem board và .agents/logs/, rồi /resume hoặc /stop."
      log "$id BLOCKED — tắt AUTO_MODE" ;;
    *) log "⚠ Trạng thái lạ '$state' ở $id — bỏ qua"; set_env_key AUTO_MODE false ;;
  esac
  return 0
}

room_env
log "🤖 Manager daemon bắt đầu — $ROOM_DIR (poll ${POLL}s)"
while true; do
  handle_inbox || tick_auto || sleep "$POLL"
done
