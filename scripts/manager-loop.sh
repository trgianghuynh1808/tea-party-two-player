#!/usr/bin/env bash
# Daemon của một phòng: chạy ở thư mục gốc project (agent-room start gọi script này).
# Mỗi vòng quyết định MỘT việc rồi làm; việc cứng chạy bằng code (scripts/room-ops.py), Claude chỉ được gọi khi cần phán đoán.
#
#   inbox có tin            → room-ops.py xử lý (/status /stop /resume /ship /usage /task, tin thường)
#                             Claude Manager chỉ khi: AUTO_SPLIT="claude" (/task) hoặc CHAT_WITH_CLAUDE="true" (tin thường)
#   AUTO_MODE=true, task đầu tiên chưa xong:
#     [pending]             → Tech Lead (Claude) lên plan, không handoff
#     [plan_ready]          → room-ops.py check-plan: OK → tự duyệt + handoff · BLOCK → chặn · REVIEW → Claude Manager xem
#     [in_progress]         → daemon TỰ CHỜ OpenCode (đọc .agents/status); khi done/stuck mới gọi Tech Lead (verify, review, merge / fix)
#     tất cả [done]         → room-ops.py finalize (báo cáo, xin /ship), không gọi Claude
#   [BLOCKED]               → tắt AUTO_MODE, báo user
#   /plan <câu hỏi>         → chế độ PLAN: Tech Lead đọc repo (chỉ Read/Grep/Glob), Manager tổng hợp gửi bạn; chạy nền, không tạo task, không sửa gì
#
# Chặn vòng lặp vô hạn: cùng một (task, trạng thái) mà sau 2 lần gọi vẫn không đổi → tắt AUTO_MODE và báo user.
# Biến (đặt trong .agents/room.env hoặc môi trường):
#   POLL (giây, mặc định 3) · CLAUDE_FLAGS (mặc định --dangerously-skip-permissions)
#   MODEL_MANAGER, MODEL_TECHLEAD (alias haiku|sonnet|opus hoặc id; trống = mặc định của claude)
#   MAX_TURNS_MANAGER (20), MAX_TURNS_TECHLEAD (150), MAX_TURNS_PLAN (40)

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
OPS="$AG/bin/room-ops.py"   # bản sao cố định (git-ignore): cây làm việc đổi theo nhánh nên scripts/room-ops.py có thể không tồn tại ở nhánh task cũ
POLL="${POLL:-3}"
CLAUDE_FLAGS="${CLAUDE_FLAGS:---dangerously-skip-permissions}"
MANAGER_PROMPT="${MANAGER_PROMPT:-$AG/MANAGER.md}"
[[ -f "$MANAGER_PROMPT" ]] || MANAGER_PROMPT="prompts/MANAGER.md"

[[ -f "$AG/room.env" ]] || { echo "⛔ Không thấy $AG/room.env — chạy: scripts/agent-room.sh init --topic <ID> --port <PORT>"; exit 1; }
[[ -f "$MANAGER_PROMPT" ]] || { echo "⛔ Không thấy prompt Manager ($MANAGER_PROMPT)"; exit 1; }
[[ -f scripts/room-ops.py ]] || { echo "⛔ Không thấy scripts/room-ops.py — chạy lại install.sh"; exit 1; }
mkdir -p "$AG/bin" && cp scripts/room-ops.py "$OPS"
command -v claude >/dev/null || { echo "⛔ Chưa cài claude CLI"; exit 1; }
command -v python3 >/dev/null || { echo "⛔ Chưa cài python3"; exit 1; }
mkdir -p "$INBOX/processed" "$INBOX/failed" "$OUTBOX" "$LOGDIR" "$AG/screenshots" "$AG/tasks" "$AG/status"

# Một daemon mỗi phòng
if [[ -f "$LOCK" ]] && kill -0 "$(cat "$LOCK" 2>/dev/null)" 2>/dev/null; then
  echo "⛔ Manager của phòng này đã chạy (pid $(cat "$LOCK"))."; exit 1
fi
echo $$ > "$LOCK"
PROGRESS_PID=""; PLAN_PID=""; LAST_TEXT=""
trap '[[ -n "$PROGRESS_PID" ]] && { pkill -P "$PROGRESS_PID" 2>/dev/null; kill "$PROGRESS_PID" 2>/dev/null; }; [[ -n "$PLAN_PID" ]] && { pkill -P "$PLAN_PID" 2>/dev/null; kill "$PLAN_PID" 2>/dev/null; rm -f "$AG/plan.pid"; }; rm -f "$LOCK"; exit 0' INT TERM EXIT

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
  MAX_FIX_CYCLES="${MAX_FIX_CYCLES:-2}"; PLAN_APPROVAL="${PLAN_APPROVAL:-auto}"
  MODEL_MANAGER="${MODEL_MANAGER:-}"; MODEL_TECHLEAD="${MODEL_TECHLEAD:-}"
  MAX_TURNS_MANAGER="${MAX_TURNS_MANAGER:-20}"; MAX_TURNS_TECHLEAD="${MAX_TURNS_TECHLEAD:-150}"; MAX_TURNS_PLAN="${MAX_TURNS_PLAN:-40}"
}

set_env_key() { # key value
  if grep -q "^$1=" "$AG/room.env"; then
    sed -i.bak -E "s|^$1=.*|$1=\"$2\"|" "$AG/room.env" && rm -f "$AG/room.env.bak"
  else
    echo "$1=\"$2\"" >> "$AG/room.env"
  fi
}

board_line() {
  # Thứ tự: việc đang chạy dở → plan bạn đã duyệt → việc mới. PLAN_APPROVAL=auto bỏ qua task đang chờ bạn (giữ plan, thiếu ngữ cảnh, bị chặn) để làm task kế tiếp.
  local act='planning|plan_ready|in_progress|revise' l=""
  [[ "${PLAN_APPROVAL:-auto}" == ask ]] && act="$act|awaiting_plan|needs_info|BLOCKED"
  for st in "$act" approved pending; do
    l="$(grep -m1 -E "^- \[ \] \`T[0-9]+\` \[($st)\]" "$BOARD" 2>/dev/null || true)"
    [[ -n "$l" ]] && break
  done
  printf '%s' "$l"
}
state_of() { sed -nE "s/^- \[ \] \`$1\` \[([A-Za-z_]+)\].*/\1/p" "$BOARD" 2>/dev/null | head -1; }
line_id()    { sed -nE 's/^- \[ \] `(T[0-9]+)`.*/\1/p' <<<"$1"; }
line_state() { sed -nE 's/^- \[ \] `T[0-9]+` \[([A-Za-z_]+)\].*/\1/p' <<<"$1"; }
line_slug()  { sed -nE 's/.*\(slug: `([^`]+)`\).*/\1/p' <<<"$1"; }
has_done()   { grep -qE '^- \[x\] `T[0-9]+` \[done\]' "$BOARD" 2>/dev/null; }
watcher_alive() { [[ -f "$AG/watcher.pid" ]] && kill -0 "$(cat "$AG/watcher.pid" 2>/dev/null)" 2>/dev/null; }

report_progress() {   # slug [--flush] — báo tiến độ (bước, test, verify, vòng sửa, merge) đọc từ file task và git, không tốn Claude
  python3 "$OPS" progress "$@" >/dev/null 2>>"$LOGDIR/ops.log" || true
}

# Biến tạm cho một lần gọi:  CUR_SLUG=<slug> báo tiến độ trong lúc Tech Lead làm việc · RC_TOOLS="Read,Grep,Glob" chỉ cho các công cụ này
# (RC_TOOLS="" = không công cụ nào; khi đặt thì KHÔNG dùng CLAUDE_FLAGS) · RC_TURNS=<n> đổi giới hạn lượt · RC_QUIET=1 không gửi tin ▶/⚠ · kết quả để ở LAST_TEXT
run_claude() { # vai(manager|techlead) prompt [nhãn]
  local role="$1" label="${3:-$1}" col model turns raw text crc prc rc
  col="$(c_role "$role")"
  if [[ "$role" == techlead ]]; then model="$MODEL_TECHLEAD"; turns="$MAX_TURNS_TECHLEAD"; else model="$MODEL_MANAGER"; turns="$MAX_TURNS_MANAGER"; fi
  turns="${RC_TURNS:-$turns}"
  if [[ -z "${2//[[:space:]]/}" ]]; then
    log "⛔ ${role}: prompt rỗng (lỗi trong manager-loop.sh), không gọi claude: ${label}"
    say_user "Ối, mình gặp lỗi nội bộ 😵 prompt của **${role}** bị rỗng (${label}). Bạn báo người bảo trì kit giúp mình nhé." manager
    return 1
  fi
  local args=(-p "$2" --output-format stream-json --verbose --max-turns "$turns")   # stream-json: the events list every tool call (logs/tools.log)
  [[ -n "$model" ]] && args+=(--model "$model")
  local flags="$CLAUDE_FLAGS"
  if [[ -n "${RC_TOOLS+x}" ]]; then args+=(--tools "$RC_TOOLS"); flags=""; fi   # chế độ chỉ đọc: giới hạn công cụ, không bỏ qua quyền

  log "▶ ${role}: ${label}${model:+ [$model]}"
  if [[ "$role" == techlead && -z "${RC_QUIET:-}" ]]; then
    case "$label" in
      *"lên plan"*) say_user "Mình bắt đầu **lên plan** cho **${label%% *}** nha 📝" techlead ;;
      *"sửa plan"*) say_user "Mình sửa plan **${label%% *}** theo góp ý của bạn nha ✏️" techlead ;;
      *verify*)     : ;;   # không báo "bắt đầu verify": tin "Code xong hết rồi nè" của Dev đã là tín hiệu bàn giao, kết quả đến trong MỘT báo cáo cuối task
      *)            say_user "Mình bắt đầu: ${label} 🛠" techlead ;;
    esac
  fi
  printf '\n━━ %s ━━ %s\n' "$(date '+%F %T')" "$label" >> "$LOGDIR/$role.log"
  local tl_kind=""
  if [[ "$role" == techlead && -n "${CUR_SLUG:-}" ]]; then
    case "$label" in *"lên plan"*|*"sửa plan"*) tl_kind=plan ;; *verify*) tl_kind=finish ;; esac
    [[ -n "$tl_kind" ]] && { mkdir -p "$AG/timeline"; printf '%s %s_start\n' "$(date +%s)" "$tl_kind" >> "$AG/timeline/$CUR_SLUG.log"; }
  fi

  if [[ "$role" == techlead && -n "${CUR_SLUG:-}" ]]; then
    ( while true; do python3 "$OPS" progress "$CUR_SLUG" >/dev/null 2>&1; sleep 5; done ) &
    PROGRESS_PID=$!
  fi
  # shellcheck disable=SC2086
  raw="$(claude "${args[@]}" $flags 2>>"$LOGDIR/$role.err")"; crc=$?
  if [[ -n "$PROGRESS_PID" ]]; then
    pkill -P "$PROGRESS_PID" 2>/dev/null; kill "$PROGRESS_PID" 2>/dev/null; wait "$PROGRESS_PID" 2>/dev/null
    PROGRESS_PID=""
    report_progress "$CUR_SLUG" --flush   # lần cuối: bắt những gì xảy ra sau lượt kiểm tra cuối cùng
  fi
  [[ -n "$tl_kind" ]] && printf '%s %s_end\n' "$(date +%s)" "$tl_kind" >> "$AG/timeline/$CUR_SLUG.log"
  text="$(printf '%s' "$raw" | python3 "$OPS" claude-result "$role" "$label" "$model")"; prc=$?
  LAST_TEXT="$text"
  while IFS= read -r l; do
    printf '%s\n' "$l" >> "$LOGDIR/$role.log"
    [[ -z "${l//[[:space:]]/}" ]] && continue
    printf '%s %s%-9s\033[0m %s\n' "$(date +%H:%M:%S)" "$col" "$role" "$l" >> "$ACTIVITY"
  done <<<"$text"

  rc=0; (( crc != 0 )) && rc=$crc; (( rc == 0 && prc != 0 )) && rc=$prc
  if (( rc == 0 )); then
    log "✔ ${role}: ${label}"
  else
    log "⚠ ${role}: ${label} thoát với mã $rc"
    [[ "$role" == techlead && -z "${RC_QUIET:-}" ]] && say_user "Ối, lần chạy **$label** bị lỗi (mã $rc) 😢 Bạn xem \`.agents/logs/techlead.log\` giúp mình nha." techlead
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
KHÔNG kill hay dừng tiến trình bạn không tự khởi động (kể cả dev server của người dùng). Nếu server đang chạy không phù hợp (thiếu biến môi trường như ADMIN_TOKEN), hãy dùng cổng khác cho server của bạn hoặc ghi rõ vào mục Verify; đừng kill server của người dùng.
Daemon tự báo tiến độ cho user từ file task và git (plan, bước xong, test, Verify, vòng sửa, merge), nên bạn KHÔNG cần viết tin: chỉ cần giữ file task đúng mẫu (tick checkbox từng bước ngay khi xong, cập nhật mục Test status dạng T1: PASS|FAIL, viết mục ## Verify và dòng cuối VERIFY: PASS|FAIL) và lưu ảnh vào .agents/screenshots/. Chỉ ghi file JSON vào .agents/outbox/ (ghi ra .tmp rồi đổi tên thành <unix-ts>-techlead-<n>.json) khi cần user quyết định điều gì: {\"from\": \"techlead\", \"text\": \"...\"}. Tin PHẢI mở đầu bằng mã task in đậm, ví dụ \"**$2** · ...\", vì user có thể chạy nhiều task cùng lúc. Giọng văn: tiếng Việt thân thiện, thoải mái, xưng mình và gọi bạn, có thể dùng emoji vừa phải. Trình bày dễ đọc: tách mục bằng dòng trống, dùng **chữ đậm** cho tiêu đề, gạch đầu dòng - cho danh sách, dấu ngược cho tên file hoặc lệnh. Ngắn gọn, tối đa khoảng 8 dòng. Không đưa secret vào tin.
LƯU Ý CHO NGƯỜI DUYỆT: khi có điều người duyệt cần biết thì ghi một dòng bắt đầu bằng 'Lưu ý:' vào 'Trạng thái hiện tại' (hoặc vào mục '## Lưu ý' nếu file task có). Ví dụ: chỗ làm lệch plan, phần chưa được kiểm tra hoặc kiểm tra ít hơn mục tiêu, bug đã biết (kể cả test đánh dấu test.fail), việc nên làm tiếp, phát hiện không chặn khi review. Hệ thống chuyển những dòng này lên Telegram; chỉ dòng có tiền tố 'Lưu ý:' hoặc 'Cảnh báo:' mới được chuyển."
  case "$1" in
    plan) printf '%s\n\nVIỆC CỦA BẠN: chỉ LÊN PLAN. Checkout %s, tạo nhánh task/%s, viết plan vào .agents/tasks/<ngày>-%s.md theo CLAUDE.md (nhớ mục "## Ý tưởng": 2-4 gạch đầu dòng mô tả sơ bộ hướng làm, người dùng đọc nó trong thẻ plan), commit file plan. KHÔNG chạy scripts/handoff.sh (daemon kiểm tra plan rồi mới giao). Nếu có file .agents/plan-feedback/%s.md thì đó là thông tin người dùng vừa bổ sung cho task này: đọc trước khi lên plan.\nNếu THIẾU NGỮ CẢNH để lên plan đáng tin cậy (yêu cầu mơ hồ, thiếu quyết định mà chỉ người dùng chốt được, không tìm thấy phần code liên quan), ĐỪNG đoán: ghi câu hỏi cụ thể (ngắn, tối đa 5 gạch đầu dòng, tiếng Việt) vào .agents/plan-feedback/%s.question.md, đổi task %s trên board.md từ [pending] sang [needs_info] rồi dừng, không tạo nhánh hay plan.\nCuối cùng đổi task %s trên board.md từ [pending] sang [plan_ready].\nTask NHỎ (đổi vị trí/chữ/màu/cấu hình, 1-2 file, không logic mới): plan 1-2 bước [dễ], đọc đúng các file liên quan (không quét repo), Verify mode none hoặc light, tối đa 1 test case (hoặc chỉ typecheck nếu type checker đã đủ), Ngữ cảnh vài dòng.\nKhi lập plan: nếu một bước test phụ thuộc giao diện do bước trước trong plan tạo ra thì selector chưa tồn tại, đừng bịa. Ghi selector là ví dụ và yêu cầu bước test ĐỌC dòng Selectors trong Trạng thái hiện tại (bước giao diện sẽ ghi lại dòng này khi làm xong).\n' "$common" "$STAGING_BRANCH" "$3" "$3" "$3" "$3" "$2" "$2" ;;
    revise) printf '%s\n\nVIỆC CỦA BẠN: người dùng đã xem plan và YÊU CẦU SỬA. Góp ý của họ nằm trong file .agents/plan-feedback/%s.md (đọc kỹ, góp ý mới nhất ở cuối). Checkout nhánh task/%s, mở plan .agents/tasks/*%s*.md và sửa cho đúng góp ý: giữ nguyên định dạng, nhãn mức [dễ|vừa|khó] và mục Test cases, cập nhật Ngữ cảnh nếu cần. Commit với message "plan(rev-N): %s" (N là số lần sửa). KHÔNG chạy scripts/handoff.sh. Cuối cùng đổi task %s trên board.md từ [revise] sang [plan_ready].\n' "$common" "$3" "$3" "$3" "$3" "$2" ;;
    finish) printf '%s\n\nVIỆC CỦA BẠN: plan đã được duyệt và đã giao cho OpenCode. Daemon đã chờ giúp bạn: OpenCode báo trạng thái "%s" cho file plan %s. TUYỆT ĐỐI không chạy scripts/wait-task.sh. Làm tiếp từ bước Verify của Autopilot (nếu trạng thái done) hoặc Fix cycle (nếu stuck), tối đa %s vòng sửa.\nNếu cần Fix cycle: ghi bước Fix vào file plan, commit plan(fix-n), chạy scripts/handoff.sh <file plan> rồi KẾT THÚC phiên ngay: daemon sẽ chờ OpenCode và gọi lại bạn với ngữ cảnh mới (mọi thông tin phải nằm trong file plan).\nLưu ảnh verify vào .agents/screenshots/ với tên bắt đầu bằng task-NN- (NN là số của task, ví dụ task-05-portal-upload.png) và chỉ chụp ảnh của kịch bản vừa verify, vì báo cáo duyệt ship chỉ gửi ảnh gắn với từng task. Task không cần ảnh (Verify none) thì không chụp. Nếu file plan có "Verify mode: none": ĐƯỜNG NGẮN, không mở trình duyệt, không chạy cả bộ e2e: chỉ chạy kiểm tra của project (typecheck/lint) và đúng các test case mà plan nêu, đọc diff một lần, rồi merge. Khi PASS: merge --squash nhánh task/%s vào %s (KHÔNG push, KHÔNG merge vào %s), xóa nhánh task, đổi task %s thành [done] và [x] trên board.md, ghi Activity Log. Nếu hết vòng sửa mà chưa đạt: [BLOCKED] + lý do.\n' "$common" "${4:-done}" "${5:-?}" "${MAX_FIX_CYCLES:-2}" "$3" "$STAGING_BRANCH" "$MAIN_BRANCH" "$2" ;;
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
    say_user "Mình bị kẹt ở \`$1\` rồi 😵 đã thử 2 lần mà không nhúc nhích được.\n\nMình tắt chế độ tự động để khỏi tốn quota. Bạn xem \`.agents/logs/\` giúp mình, rồi gõ \`/resume\` để thử lại nhé."
    rm -f "$SIG"
    return 1
  fi
  return 0
}

# ---------- chế độ PLAN: Manager và Tech Lead cùng trả lời một câu hỏi, chỉ đọc, không sửa gì ----------
# Tech Lead chỉ có công cụ Read/Grep/Glob (không thể ghi file hay chạy lệnh), Manager tổng hợp không dùng công cụ nào.
# Chạy nền để daemon vẫn xử lý lệnh khác và theo dõi task trong lúc chờ.

plan_tech_prompt() { # câu hỏi
  cat <<EOF
Bạn là Tech Lead (Claude Code) ở CHẾ ĐỘ PLAN: chỉ đọc và phân tích, tuyệt đối KHÔNG sửa gì. Bạn chỉ có công cụ Read, Grep, Glob nên không thể ghi file hay chạy lệnh, và đừng cố làm vậy.
Manager chuyển cho bạn câu hỏi của người dùng (Product Owner):
---
$1
---
Cách làm:
1. Đọc AGENTS.md, CLAUDE.md và .agents/board.md để nắm bối cảnh. Sau đó chỉ đọc những file hoặc thư mục cần để trả lời, đừng quét cả repo.
2. Trả lời dựa trên code thật, dẫn chứng bằng đường dẫn file (và tên hàm nếu có). Chỗ nào không chắc hoặc không thấy trong repo thì nói rõ là chưa chắc, đừng đoán.
3. Nếu câu hỏi là yêu cầu làm tính năng hay sửa lỗi thì đừng làm. Hãy phân tích hướng làm, các file sẽ động tới, rủi ro, và đề xuất cách chia thành các task nhỏ (mỗi task một dòng).
Trả về văn bản markdown tiếng Việt gồm các mục: Kết luận ngắn (2-3 câu), Chi tiết kỹ thuật (gạch đầu dòng), File liên quan, Rủi ro hoặc điều chưa chắc, Gợi ý việc nên làm (nếu có). Đây là báo cáo gửi cho Manager nên không cần giọng thân mật.
EOF
}

plan_mgr_prompt() { # câu hỏi, tình hình board, phân tích của Tech Lead
  cat <<EOF
Bạn là Manager (PM) của dự án. Người dùng đang hỏi bạn ở CHẾ ĐỘ PLAN. Tech Lead đã đọc repo và gửi phân tích. Nhiệm vụ của bạn là tổng hợp thành MỘT tin nhắn trả lời người dùng.

Câu hỏi của người dùng:
---
$1
---

Tình hình board hiện tại:
---
$2
---

Phân tích của Tech Lead:
---
$3
---

Yêu cầu cho tin nhắn:
- Tiếng Việt, thân thiện và thoải mái (xưng mình, gọi bạn, emoji vừa phải), dễ đọc: tách mục bằng dòng trống, tiêu đề in đậm bằng **, danh sách dùng gạch đầu dòng với một ý mỗi dòng, tên file và lệnh đặt trong dấu backtick.
- Mở đầu bằng câu trả lời ngắn gọn cho câu hỏi. Có mục **Góc nhìn Tech Lead** nêu ý chính về kỹ thuật.
- Chỉ dùng thông tin trong phân tích của Tech Lead và board, không bịa thêm. Nếu Tech Lead nói chưa chắc thì giữ nguyên sự chưa chắc đó.
- Nếu có hướng làm cụ thể, thêm mục **Nếu bạn muốn mình làm** với các dòng lệnh /task gợi ý (mỗi dòng một việc nhỏ) để bạn copy. Nhắc đây mới là gợi ý, chưa có gì được làm.
- Tối đa khoảng 25 dòng. Chỉ trả về nội dung tin nhắn, không thêm lời dẫn và không bọc trong khối code.
EOF
}

start_plan_job() { # file inbox của lệnh /plan
  if [[ -f "$AG/plan.pid" ]] && kill -0 "$(cat "$AG/plan.pid" 2>/dev/null)" 2>/dev/null; then
    say_user "Mình đang xử lý một câu hỏi khác rồi 🙇 Bạn chờ mình trả lời xong rồi hỏi tiếp nha ⏳" manager
    log "⚙ /plan bị từ chối: đang có một câu hỏi chạy"
    return 0
  fi
  mkdir -p "$AG/plan"
  local qf; qf="$AG/plan/$(date +%Y%m%d-%H%M%S).question.md"
  python3 "$OPS" inbox-args "$1" > "$qf" 2>>"$LOGDIR/ops.log"
  ( plan_run "$qf" ) >>"$LOGDIR/plan.log" 2>&1 &
  PLAN_PID=$!
  echo "$PLAN_PID" > "$AG/plan.pid"
  log "⚙ /plan: bắt đầu trả lời câu hỏi (chạy nền, chỉ đọc)"
}

plan_run() { # file câu hỏi (chạy trong subshell nền)
  local qf="$1" base q findings
  base="${qf%.question.md}"
  q="$(cat "$qf")"
  trap 'rm -f "$AG/plan.pid"' EXIT

  say_user "Mình nhận câu hỏi rồi nè 📝 Mình nhờ Tech Lead xem code giúp, xong mình tổng hợp gửi bạn nha.\n\nChế độ \`/plan\` chỉ đọc và phân tích, sẽ không sửa gì hay tạo task nào hết." manager
  say_user "Mình bắt đầu đọc repo để trả lời đây 🔍 (chỉ đọc, không sửa gì)" techlead

  if ! RC_QUIET=1 RC_TOOLS="Read,Grep,Glob" RC_TURNS="${MAX_TURNS_PLAN:-40}" run_claude techlead "$(plan_tech_prompt "$q")" "plan: tìm hiểu"; then
    say_user "Ối, Tech Lead tìm hiểu bị lỗi 😢 Bạn xem \`.agents/logs/techlead.log\` giúp mình, hoặc hỏi lại nha." manager
    return 1
  fi
  findings="$LAST_TEXT"
  printf '%s\n' "$findings" > "$base.findings.md"
  if [[ -z "${findings//[[:space:]]/}" ]]; then
    say_user "Tech Lead không trả về nội dung nào 🤔 Bạn thử hỏi lại cụ thể hơn giúp mình nha." manager
    return 1
  fi

  if RC_QUIET=1 RC_TOOLS="" RC_TURNS=3 run_claude manager "$(plan_mgr_prompt "$q" "$(python3 "$OPS" status 2>/dev/null)" "$findings")" "plan: tổng hợp"; then
    printf '%s\n' "$LAST_TEXT" > "$base.answer.md"
  else
    # Manager lỗi: vẫn gửi phân tích của Tech Lead để bạn không mất công sức đã tốn
    printf '%s\n\n_(Manager chưa tổng hợp được nên mình gửi nguyên phân tích của Tech Lead.)_\n' "$findings" > "$base.answer.md"
  fi
  python3 "$OPS" say-file manager "$base.answer.md" >/dev/null 2>>"$LOGDIR/ops.log" || true
  log "✔ /plan: đã gửi câu trả lời ($(basename "$base").answer.md)"
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
      5) start_plan_job "$f"; mv "$f" "$INBOX/processed/" ;;
      *) mv "$f" "$INBOX/failed/"; log "⚠ lỗi khi xử lý $(basename "$f") (xem ops.log)"
         say_user "Ối, mình xử lý tin nhắn của bạn bị lỗi 😢 Xem \`.agents/logs/ops.log\` giúp mình nha (tin đã chuyển sang \`inbox/failed/\`)." ;;
    esac
  done
  if (( ${#claude_files[@]} )); then
    for f in "${claude_files[@]}"; do listing+="- $f"$'\n'; done
    if run_claude manager "$(manager_prompt INBOX "Tin nhắn cần xử lý (đọc từng file):"$'\n'"$listing")" "xử lý tin nhắn (${#claude_files[@]})"; then
      mv "${claude_files[@]}" "$INBOX/processed/"
    else
      mv "${claude_files[@]}" "$INBOX/failed/"
      say_user "Ối, Manager xử lý tin nhắn bị lỗi 😢 Xem \`.agents/logs/manager.log\` giúp mình nha (tin đã chuyển sang \`inbox/failed/\`)."
    fi
  fi
  return 0
}

tick_auto() {
  room_env
  [[ "$AUTO_MODE" == "true" ]] || return 1
  local line id state slug plan st st_state st_ts fixes verdict
  if [[ "$PLAN_APPROVAL" == auto ]] && (( SECONDS - ${LAST_SKIP_CHECK:-0} >= 10 )); then
    LAST_SKIP_CHECK=$SECONDS
    python3 "$OPS" skipped-notice >/dev/null 2>>"$LOGDIR/ops.log" || true   # báo task bị bỏ qua (bị chặn, thiếu ngữ cảnh)
  fi
  line="$(board_line)"
  if [[ -z "$line" ]]; then
    # Không còn task chưa xong: có task done → chốt batch (bằng code, không gọi Claude)
    if has_done; then
      log "⚙ chốt batch, báo cáo xin duyệt ship"
      python3 "$OPS" finalize >/dev/null 2>>"$LOGDIR/ops.log" || {
        set_env_key AUTO_MODE false; say_user "Mình không tạo được báo cáo chốt batch 😢 Xem \`.agents/logs/ops.log\` nhé. Mình tắt chế độ tự động rồi."; }
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
        say_user "Senior Dev (OpenCode) chưa online nên mình chưa dám bắt đầu **$id** 😴\n\n**Cách xử lý**\n- Bật lại: \`scripts/agent-room.sh start\`\n- Kiểm tra: \`/health\`\n- Rồi gõ \`/resume\` để mình chạy tiếp\n\nMình đã tắt chế độ tự động trong lúc chờ."
        log "⛔ preflight: watcher không chạy — tắt AUTO_MODE"
        return 0
      fi
      guard "$id:$state" && CUR_SLUG="$slug" run_claude techlead "$(techlead_prompt plan "$id" "$slug")" "$id lên plan" ;;
    plan_ready)
      guard "$id:$state" || return 0
      report_progress "$slug"   # gửi thẻ plan; PLAN_APPROVAL=ask thì task chuyển sang awaiting_plan và chờ bạn bấm nút
      [[ "$(state_of "$id")" == plan_ready ]] || return 0   # đã chuyển sang chờ bạn duyệt (hoặc bị giữ lại vì rủi ro)
      verdict="$(python3 "$OPS" check-plan "$slug" 2>>"$LOGDIR/ops.log")"
      log "⚙ $id kiểm tra plan: $verdict"
      case "$verdict" in
        OK) if ! watcher_alive; then
              set_env_key AUTO_MODE false
              say_user "Plan **$id** xong rồi nhưng Senior Dev (OpenCode) vừa offline 😴 nên mình chưa giao việc.\n\n**Cách xử lý**\n- Bật lại: \`scripts/agent-room.sh start\`\n- Rồi gõ \`/resume\` để mình giao tiếp\n\nMình đã tắt chế độ tự động trong lúc chờ."
              log "⛔ $id: watcher không chạy lúc hand-off — tắt AUTO_MODE"
              return 0
            fi
            python3 "$OPS" approve "$slug" >>"$LOGDIR/ops.log" 2>&1 \
              || log "⚠ $id: duyệt/hand-off lỗi (task đã được đánh dấu BLOCKED, xem ops.log)" ;;
        BLOCK*) python3 "$OPS" block "$id" "${verdict#BLOCK: }" >/dev/null 2>>"$LOGDIR/ops.log" ;;
        REVIEW*|CRITICAL*)   # nghi ngờ nhẹ: vẫn duyệt (không tốn lượt Claude), nói cho bạn biết lý do. Nghiêm trọng đã được giữ lại ở thẻ plan.
           python3 "$OPS" approve "$slug" >>"$LOGDIR/ops.log" 2>&1 \
             && { python3 "$OPS" review-note "$id" "${verdict#*: }" >/dev/null 2>>"$LOGDIR/ops.log" || true; } \
             || log "⚠ $id: duyệt/hand-off lỗi (xem ops.log)" ;;
        *) log "⚠ $id: kết quả kiểm tra plan lạ: $verdict" ;;
      esac ;;
    approved)
      python3 "$OPS" approve "$slug" user >>"$LOGDIR/ops.log" 2>&1 || log "⚠ $id: giao plan đã duyệt cho OpenCode bị lỗi (xem ops.log)" ;;
    needs_info) return 1 ;;   # chờ bạn bổ sung thông tin (/revise Tn <thông tin>)
    awaiting_plan) return 1 ;;   # đang chờ bạn duyệt plan trên Telegram (nút Duyệt / Sửa plan / Hủy): không gọi Claude, không tốn gì
    revise)
      guard "$id:$state" && CUR_SLUG="$slug" run_claude techlead "$(techlead_prompt revise "$id" "$slug")" "$id sửa plan theo góp ý" ;;
    in_progress)
      report_progress "$slug"   # OpenCode đang code: báo bước/commit/test vừa xong
      plan="$(python3 "$OPS" plan-path "$slug" 2>>"$LOGDIR/ops.log")"
      st=""; [[ -n "$plan" ]] && st="$AG/status/$(basename "$plan" .md).status"
      st_state="none"; st_ts=0
      [[ -n "$st" && -f "$st" ]] && read -r st_state st_ts < "$st"
      case "$st_state" in done|stuck) report_progress "$slug" --flush ;; esac   # OpenCode xong: gửi nốt phần còn lại
      case "$st_state" in
        queued|running)
          # Daemon tự chờ OpenCode; chỉ báo động nếu job nằm 'queued' lâu mà watcher đã chết
          if [[ "$st_state" == queued ]] && (( $(date +%s) - ${st_ts:-0} > 180 )); then
            set_env_key AUTO_MODE false
            if watcher_alive; then
              say_user "**$id** đã chờ OpenCode hơn 3 phút mà vẫn chưa được nhận 🤔 Watcher vẫn đang chạy nên có thể job bị bỏ qua. Bạn xem pane watcher và nhánh git hiện tại giúp mình nha. Mình tắt chế độ tự động rồi."
            else
              say_user "**$id** đã chờ hơn 3 phút mà watcher OpenCode không chạy 😴 Bạn chạy \`scripts/agent-room.sh start\` rồi gõ \`/resume\` giúp mình nhé. Mình tắt chế độ tự động rồi."
            fi
            log "⛔ $id queued quá lâu — tắt AUTO_MODE"
          fi
          return 1 ;;
      esac
      fixes="$(git log --oneline "$STAGING_BRANCH..task/$slug" --grep 'plan(fix-' 2>/dev/null | wc -l | tr -d ' ')"
      guard "$id:$st_state:$fixes" && CUR_SLUG="$slug" run_claude techlead "$(techlead_prompt finish "$id" "$slug" "$st_state" "$plan")" "$id verify, review, merge" ;;
    BLOCKED)
      set_env_key AUTO_MODE false
      say_user "**$id** đang bị chặn 🚧 (\`$slug\`)\nMình tắt chế độ tự động rồi. Bạn xem board và \`.agents/logs/\`, sau đó gõ \`/resume\` hoặc \`/stop\` nhé."
      log "$id BLOCKED — tắt AUTO_MODE" ;;
    *) log "⚠ Trạng thái lạ '$state' ở $id — bỏ qua"; set_env_key AUTO_MODE false
       say_user "Mình gặp một trạng thái lạ ở **$id** (\`$state\`) nên đã **tắt chế độ tự động** cho an toàn 🛑\nBạn xem \`board.md\` rồi gõ \`/resume\` hoặc \`/clear\` nhé." ;;
  esac
  return 0
}

room_env
log "🤖 Manager daemon bắt đầu — $ROOM_DIR (poll ${POLL}s)"
while true; do
  handle_inbox || tick_auto || sleep "$POLL"
done
