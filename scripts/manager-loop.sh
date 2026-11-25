#!/usr/bin/env bash
# Daemon của một phòng: chạy ở thư mục gốc project (agent-room start gọi script này).
# Mỗi vòng quyết định MỘT việc cần làm rồi gọi `claude -p` đúng vai; không có việc thì chỉ ngủ (không tốn quota).
#
#   inbox có tin           → Manager  MODE: INBOX
#   AUTO_MODE=true, task đầu tiên chưa xong:
#     [pending]            → Tech Lead lên plan (không handoff)
#     [plan_ready]         → Manager  MODE: APPROVE_PLAN (guardrails, rồi handoff cho OpenCode)
#     [in_progress]        → Tech Lead chờ OpenCode, verify, review, merge vào staging
#     tất cả [done]        → Manager  MODE: FINALIZE (báo cáo, xin /ship)
#   [BLOCKED]              → tắt AUTO_MODE, báo user
#
# Chặn vòng lặp vô hạn: cùng một (task, trạng thái) mà sau 2 lần gọi vẫn không đổi → tắt AUTO_MODE và báo user.
# Biến: POLL (giây, mặc định 10) · CLAUDE_FLAGS (mặc định --dangerously-skip-permissions) · MANAGER_PROMPT

set -uo pipefail

ROOM_DIR="$(pwd)"
AG=".agents"
BOARD="$AG/board.md"
INBOX="$AG/inbox"
OUTBOX="$AG/outbox"
LOGDIR="$AG/logs"
LOCK="$AG/manager.lock"
SIG="$AG/manager.sig"
POLL="${POLL:-10}"
CLAUDE_FLAGS="${CLAUDE_FLAGS:---dangerously-skip-permissions}"
MANAGER_PROMPT="${MANAGER_PROMPT:-$AG/MANAGER.md}"
[[ -f "$MANAGER_PROMPT" ]] || MANAGER_PROMPT="prompts/MANAGER.md"

[[ -f "$AG/room.env" ]] || { echo "⛔ Không thấy $AG/room.env — chạy: scripts/agent-room.sh init --topic <ID> --port <PORT>"; exit 1; }
[[ -f "$MANAGER_PROMPT" ]] || { echo "⛔ Không thấy prompt Manager ($MANAGER_PROMPT)"; exit 1; }
command -v claude >/dev/null || { echo "⛔ Chưa cài claude CLI"; exit 1; }
mkdir -p "$INBOX/processed" "$INBOX/failed" "$OUTBOX" "$LOGDIR" "$AG/screenshots" "$AG/tasks"

# Một daemon mỗi phòng
if [[ -f "$LOCK" ]] && kill -0 "$(cat "$LOCK" 2>/dev/null)" 2>/dev/null; then
  echo "⛔ Manager của phòng này đã chạy (pid $(cat "$LOCK"))."; exit 1
fi
echo $$ > "$LOCK"
trap 'rm -f "$LOCK"; exit 0' INT TERM EXIT

log() { printf '[%s] %s\n' "$(date '+%F %T')" "$*" | tee -a "$LOGDIR/manager.log"; }

say_user() {   # gửi một tin ra outbox (ghi tạm rồi đổi tên để bridge không đọc file dở)
  local f="$OUTBOX/$(date +%s)-$$-$RANDOM.json"
  python3 -c 'import json,sys; print(json.dumps({"text": sys.argv[1]}, ensure_ascii=False))' "$1" > "$f.tmp" && mv "$f.tmp" "$f"
}

room_env() {   # nạp lại mỗi vòng để thấy AUTO_MODE mới
  # shellcheck source=/dev/null
  source "$AG/room.env"
  AUTO_MODE="${AUTO_MODE:-false}"; STAGING_BRANCH="${STAGING_BRANCH:-staging}"; MAIN_BRANCH="${MAIN_BRANCH:-main}"
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
has_done()   { grep -qE '^- \[x\] `T[0-9]+`' "$BOARD" 2>/dev/null; }

run_claude() { # tên-log prompt
  log "▶ claude ($1)"
  # shellcheck disable=SC2086
  claude -p "$2" $CLAUDE_FLAGS >> "$LOGDIR/$1.log" 2>&1
  local rc=$?
  (( rc == 0 )) || log "⚠ claude ($1) thoát với mã $rc"
  return $rc
}

manager_prompt() { # MODE extra
  printf '%s\n\n---\nMODE: %s\nProject root: %s\n%s\n' "$(cat "$MANAGER_PROMPT")" "$1" "$ROOM_DIR" "${2:-}"
}

techlead_prompt() { # phase id slug
  local common="Bạn là Tech Lead (Claude Code) trong phòng tự động (AUTO_MODE=true). Làm theo CLAUDE.md, mục Autopilot/AUTO_MODE.
Nhánh nền là '$STAGING_BRANCH' (không phải $MAIN_BRANCH). Task: $2, slug: $3 (xem tiêu đề trên .agents/board.md).
Không hỏi người dùng, không dừng chờ input. Gặp việc không làm được: đặt task thành [BLOCKED] trên board.md, ghi lý do vào Activity Log, rồi dừng."
  case "$1" in
    plan) printf '%s\n\nVIỆC CỦA BẠN: chỉ LÊN PLAN. Checkout %s, tạo nhánh task/%s, viết plan vào .agents/tasks/<ngày>-%s.md theo CLAUDE.md, commit file plan. KHÔNG chạy scripts/handoff.sh (Manager duyệt plan rồi mới giao). Cuối cùng đổi task %s trên board.md từ [pending] sang [plan_ready].\n' "$common" "$STAGING_BRANCH" "$3" "$3" "$2" ;;
    finish) printf '%s\n\nVIỆC CỦA BẠN: plan đã được duyệt và đã giao cho OpenCode. Chạy Autopilot từ bước Wait (scripts/wait-task.sh với file plan của task này), Verify, Review, Fix cycle (tối đa %s vòng). Lưu ảnh verify vào .agents/screenshots/. Khi PASS: merge --squash nhánh task/%s vào %s (KHÔNG push, KHÔNG merge vào %s), xóa nhánh task, đổi task %s thành [done] và [x] trên board.md, ghi Activity Log. Nếu hết vòng sửa mà chưa đạt: [BLOCKED] + lý do.\n' "$common" "${MAX_FIX_CYCLES:-2}" "$3" "$STAGING_BRANCH" "$MAIN_BRANCH" "$2" ;;
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
  local files=() f
  while IFS= read -r f; do files+=("$f"); done < <(ls -1 "$INBOX"/*.json 2>/dev/null | sort)
  (( ${#files[@]} )) || return 1
  local listing=""
  for f in "${files[@]}"; do listing+="- $f"$'\n'; done
  if run_claude manager "$(manager_prompt INBOX "Tin nhắn cần xử lý (đọc từng file):"$'\n'"$listing")"; then
    mv "${files[@]}" "$INBOX/processed/"
  else
    mv "${files[@]}" "$INBOX/failed/"
    say_user "⚠️ Manager lỗi khi xử lý tin nhắn (xem .agents/logs/manager.log). Tin đã chuyển sang inbox/failed/."
  fi
  return 0
}

tick_auto() {
  room_env
  [[ "$AUTO_MODE" == "true" ]] || return 1
  local line id state slug
  line="$(board_line)"
  if [[ -z "$line" ]]; then
    # Không còn task chưa xong: có task done → chốt batch, không thì chẳng có gì làm
    if has_done; then
      guard "finalize" && run_claude manager "$(manager_prompt FINALIZE)"
      return 0
    fi
    return 1
  fi
  id="$(line_id "$line")"; state="$(line_state "$line")"; slug="$(line_slug "$line")"
  case "$state" in
    pending)     guard "$id:$state" && run_claude techlead "$(techlead_prompt plan "$id" "$slug")" ;;
    plan_ready)  guard "$id:$state" && run_claude manager "$(manager_prompt APPROVE_PLAN "Task: $id (slug: $slug)")" ;;
    in_progress) guard "$id:$state" && run_claude techlead "$(techlead_prompt finish "$id" "$slug")" ;;
    BLOCKED)
      set_env_key AUTO_MODE false
      say_user "⛔ Task $id ($slug) đang BLOCKED. Đã tắt AUTO_MODE. Xem board và .agents/logs/, rồi /resume hoặc /stop."
      log "$id BLOCKED — tắt AUTO_MODE" ;;
    *) log "⚠ Trạng thái lạ '$state' ở $id — bỏ qua"; set_env_key AUTO_MODE false ;;
  esac
  return 0
}

log "🤖 Manager daemon bắt đầu — $ROOM_DIR (poll ${POLL}s)"
while true; do
  handle_inbox || tick_auto || sleep "$POLL"
done
