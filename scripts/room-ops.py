#!/usr/bin/env python3
"""Deterministic room operations (no AI). Run from the project root.

Used by scripts/manager-loop.sh so the Manager only needs Claude for judgement calls.

  room-ops.py inbox <file>          handle one inbox message (exit 0 handled, 3 = needs Claude, other = error)
  room-ops.py say <role> <text>     write a message to .agents/outbox
  room-ops.py say-file <role> <file>   same, text taken verbatim from a file
  room-ops.py inbox-args <file>     print the arguments of an inbox message (the /plan question)
  room-ops.py say-steps <role> <head> <step line>...   same, with the plan steps listed under <head>
  room-ops.py status | stop | resume | usage [days]
  room-ops.py plan-path <slug>      path of the newest plan file for a task slug
  room-ops.py check-plan <slug>     prints OK | BLOCK: <why> | REVIEW: <why>
  room-ops.py review-note <id> <reasons>   tell the user why a doubted plan was still approved
  room-ops.py approve <slug>        mark plan APPROVED_BY_MANAGER, commit, hand off to OpenCode
  room-ops.py block <id> <reason>   mark task BLOCKED, turn AUTO_MODE off, tell the user
  room-ops.py finalize              build the ship report (outbox, APPROVE_SHIP), phase AWAITING_SHIP_APPROVAL
  room-ops.py progress <slug>       report new progress (plan, steps, tests, verify, fix, merge) read from the task file and git
  room-ops.py claude-result <role> <label> <model>   stdin: `claude -p --output-format stream-json --verbose` (or json); prints text, logs usage and tool calls
"""
import glob
import collections
import json
import os
import re
import shutil
import subprocess
import sys
import time
import unicodedata
from datetime import datetime

AG = ".agents"
BOARD = f"{AG}/board.md"
ENVF = f"{AG}/room.env"
OUTBOX = f"{AG}/outbox"
USAGE_LOG = f"{AG}/logs/usage.log"
TASK_RE = re.compile(r"^- \[( |x)\] `(T\d+)` \[(\w+)\] (.*?) \(slug: `([^`]+)`\)\s*$")

HELP = ("Mình chỉ hiểu mấy lệnh này thôi nha 😅\n"
        "- `/task <việc cần làm>` · giao việc, mỗi dòng một việc\n"
        "- `/status` · xem tiến độ\n"
        "- `/health` · kiểm tra các agent\n"
        "- `/usage` · xem mức dùng token\n"
        "- `/plan <câu hỏi>` · hỏi đáp, phân tích project (chỉ đọc, không sửa gì)\n"
        "- `/automode on|off` · bật: tự duyệt plan · tắt: bạn duyệt từng plan (ship luôn cần bạn)\n"
        "- `/config` · xem hoặc đổi cấu hình (`/config approval auto`)\n"
        "- `/approve` · `/revise <góp ý>` · `/reject` · duyệt, nhờ sửa hoặc hủy plan đang chờ\n"
        "- `/clear` · dọn board và trạng thái cũ (lưu bản sao board)\n"
        "- `/clearlog` · dọn log chạy (giữ vài trăm dòng cuối)\n"
        "- `/stop` · dừng lại\n"
        "- `/resume` · chạy tiếp · `/resume T03` thử lại đúng một task bị chặn\n"
        "- `/ship` · đưa lên main\n"
        "Gõ `/` để xem menu. Tin thường mình không đọc để tiết kiệm quota nhé 🌱")

STATE_VI = {"pending": "chờ lên plan", "planning": "đang lên plan", "plan_ready": "plan xong, đang kiểm tra",
            "awaiting_plan": "chờ bạn duyệt plan", "needs_info": "thiếu ngữ cảnh, chờ bạn bổ sung", "approved": "bạn đã duyệt, chờ tới lượt",
            "revise": "Tech Lead đang sửa plan", "cancelled": "đã hủy",
            "in_progress": "OpenCode đang code", "done": "xong, chờ ship", "shipped": "đã ship", "BLOCKED": "bị chặn"}


# ---------- room.env ----------
def read_env():
    out = {}
    try:
        with open(ENVF, encoding="utf8") as f:
            for line in f:
                m = re.match(r'^([A-Z_][A-Z0-9_]*)="?([^"\n]*)"?\s*$', line)
                if m:
                    out[m.group(1)] = m.group(2)
    except FileNotFoundError:
        pass
    return out


def set_env(key, value):
    lines = []
    try:
        with open(ENVF, encoding="utf8") as f:
            lines = f.read().split("\n")
    except FileNotFoundError:
        pass
    done = False
    for i, line in enumerate(lines):
        if re.match(rf"^{key}=", line):
            lines[i] = f'{key}="{value}"'
            done = True
    if not done:
        if lines and lines[-1] == "":
            lines.insert(len(lines) - 1, f'{key}="{value}"')
        else:
            lines.append(f'{key}="{value}"')
    with open(ENVF, "w", encoding="utf8") as f:
        f.write("\n".join(lines))


# ---------- board.md ----------
def read_board():
    with open(BOARD, encoding="utf8") as f:
        return f.read().split("\n")


BOOL_WORDS = {"true": "true", "on": "true", "bật": "true", "bat": "true", "yes": "true", "1": "true",
              "false": "false", "off": "false", "tắt": "false", "tat": "false", "no": "false", "0": "false"}
# name used in chat, env key, board label, kind, default, explanation. Only these can be changed from chat (never ports, branches, ids).
CONFIG = [
    ("approval", "PLAN_APPROVAL", "Plan Approval", ("ask", "auto"), "auto", "auto = tự duyệt, chỉ dừng khi rủi ro nghiêm trọng, thiếu ngữ cảnh hoặc bị chặn (rồi làm task kế tiếp) · ask = luôn chờ bạn duyệt bằng thẻ. Giống `/automode on|off`"),
    ("links", "COMMIT_LINKS", "Commit Links", "bool", "true", "bật = daemon push nhánh task lên GitHub để báo cáo có link commit"),
    ("split", "AUTO_SPLIT", "Auto Split", ("lines", "claude"), "lines", "lines = mỗi dòng của /task là một task · claude = Manager tách"),
    ("chat", "CHAT_WITH_CLAUDE", "Chat With Claude", "bool", "false", "bật = Claude trả lời tin thường (tốn quota)"),
    ("model_manager", "MODEL_MANAGER", "Manager Model", "model", "", "haiku, sonnet, opus hoặc id đầy đủ; `default` = mặc định của claude"),
    ("model_techlead", "MODEL_TECHLEAD", "Tech Lead Model", "model", "", "như trên"),
    ("fix_cycles", "MAX_FIX_CYCLES", "Max Fix Cycles", (1, 5), "2", "số vòng sửa tối đa trước khi báo kẹt (1 đến 5)"),
    ("keep_shipped", "KEEP_SHIPPED", "Keep Shipped", (0, 50), "5", "số task đã ship giữ lại trên board sau /ship (0 đến 50)"),
]
CONFIG_LABELS = [c[2] for c in CONFIG] + ["Dev Port"]


def config_value(env, key, default):
    return env.get(key, default)


def display_value(kind, value):
    if kind == "bool":
        return "ON" if value == "true" else "OFF"
    if kind == "model":
        return value or "default"
    return value


def config_pairs(env=None):
    """(label, value shown on the board) for every setting that changes how the room behaves."""
    env = read_env() if env is None else env
    rows = [(label, display_value(kind, config_value(env, key, default))) for _, key, label, kind, default, _ in CONFIG]
    if env.get("APP_PORT"):
        rows.append(("Dev Port", env["APP_PORT"]))
    return rows


def sync_config(lines):
    """Keep the settings block in the board header equal to room.env, so `/status` and the dashboard always show the truth."""
    rx = re.compile(r"^- \*\*(" + "|".join(re.escape(l) for l in CONFIG_LABELS) + r"):\*\*")
    lines[:] = [l for l in lines if not rx.match(l)]
    at = next((i for i, l in enumerate(lines) if l.startswith("- **Staging Branch:**")), None)
    if at is None:
        at = next((i for i, l in enumerate(lines) if l.startswith("- **Current Phase:**")), min(2, len(lines) - 1))
    lines[at + 1:at + 1] = [f"- **{label}:** {value}" for label, value in config_pairs()]


def write_board(lines):
    sync_config(lines)
    with open(BOARD, "w", encoding="utf8") as f:
        f.write("\n".join(lines))


def tasks(lines):
    out = []
    for i, line in enumerate(lines):
        m = TASK_RE.match(line)
        if m:
            out.append({"i": i, "done": m.group(1) == "x", "id": m.group(2), "state": m.group(3),
                        "title": m.group(4), "slug": m.group(5)})
    return out


def set_header(lines, key, value):
    for i, line in enumerate(lines):
        if re.match(rf"^- \*\*{re.escape(key)}:\*\*", line):
            lines[i] = f"- **{key}:** {value}"
            return
    # header line missing: insert after the title
    lines.insert(1 if lines else 0, f"- **{key}:** {value}")


def get_phase(lines):
    for line in lines:
        m = re.match(r"^- \*\*Current Phase:\*\*\s*(\S+)", line)
        if m:
            return m.group(1)
    return "IDLE"


def log_line(lines, msg):
    while lines and lines[-1] == "":
        lines.pop()
    lines.append(f"- [{datetime.now():%Y-%m-%d %H:%M}] {msg}")
    lines.append("")


def set_state(lines, task_id, state):
    for t in tasks(lines):
        if t["id"] == task_id:
            mark = "x" if state in ("done", "shipped", "cancelled") else " "
            lines[t["i"]] = f"- [{mark}] `{t['id']}` [{state}] {t['title']} (slug: `{t['slug']}`)"
            return True
    return False


def set_auto(lines, on, phase):
    set_env("AUTO_MODE", "true" if on else "false")
    set_header(lines, "Auto Mode", "ON" if on else "OFF")
    set_header(lines, "Current Phase", phase)


# ---------- outbox ----------
def emit(role, text, **extra):
    os.makedirs(OUTBOX, exist_ok=True)
    name = f"{time.time_ns()}-{role}.json"
    path = os.path.join(OUTBOX, name)
    with open(path + ".tmp", "w", encoding="utf8") as f:
        json.dump({"from": role, "text": text, **extra}, f, ensure_ascii=False)
    os.replace(path + ".tmp", path)


def git(*args):
    p = subprocess.run(["git", *args], capture_output=True, text=True)
    return p.returncode, (p.stdout + p.stderr).strip()


# ---------- commands ----------
def slugify(s):
    s = s.replace("đ", "d").replace("Đ", "D")
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:40].strip("-")


ICON = {"pending": "⏳", "planning": "📝", "plan_ready": "📋", "in_progress": "🔧", "done": "✅",
        "shipped": "🚀", "BLOCKED": "🚧", "awaiting_plan": "🕒", "needs_info": "❓", "approved": "👍", "revise": "✏️", "cancelled": "🚫"}


def one_line_status():
    lines = read_board()
    ts = tasks(lines)
    finished = [t for t in ts if t["state"] in ("done", "shipped", "cancelled")]
    return f"Hiện tại: **{get_phase(lines)}** · {len(finished)}/{len(ts)} việc xong"


def status_text():
    lines = read_board()
    ts = tasks(lines)
    e = read_env()
    finished = [t for t in ts if t["state"] in ("done", "shipped", "cancelled")]
    out = ["📋 **Tình hình dự án**",
           f"- Giai đoạn: **{get_phase(lines)}** · {'đang chạy' if e.get('AUTO_MODE') == 'true' else 'tạm dừng'}",
           f"- Chế độ tự động: **{'TẮT: bạn duyệt từng plan' if e.get('PLAN_APPROVAL', 'auto') == 'ask' else 'BẬT: tự duyệt plan'}** (ship luôn cần bạn)",
           f"- Tiến độ: **{len(finished)}/{len(ts)}** việc xong"]
    if ts:
        out += ["", "**Danh sách việc**"]
        for t in ts:
            out.append(f"{ICON.get(t['state'], '•')} **{t['id']}** · {short(t['title'], 80)} ({STATE_VI.get(t['state'], t['state'])})")
    else:
        out += ["", "Board đang trống nè 🍃 Gõ `/task <việc cần làm>` để mình bắt đầu nhé."]
    out += ["", "**Cấu hình** (đổi bằng `/config`)"]
    pretty = {"Plan Approval": lambda v: "bạn duyệt plan" if v == "ask" else "tự duyệt", "Commit Links": lambda v: "bật" if v == "ON" else "tắt",
              "Auto Split": lambda v: "mỗi dòng một task" if v == "lines" else "Claude tách", "Chat With Claude": lambda v: "bật" if v == "ON" else "tắt"}
    names = {"Plan Approval": "Duyệt plan", "Commit Links": "Link commit", "Auto Split": "Tách /auto", "Chat With Claude": "Claude trả lời tin thường",
             "Manager Model": "Model Manager", "Tech Lead Model": "Model Tech Lead", "Max Fix Cycles": "Vòng sửa tối đa", "Keep Shipped": "Giữ task đã ship",
             "Dev Port": "Cổng dev"}
    for label, value in config_pairs(e):
        shown = pretty.get(label, lambda v: v)(value)
        out.append(f"- {names.get(label, label)}: **{shown}**" + (f" (`{value}`)" if label in pretty and shown != value else ""))
    return "\n".join(out)


def cmd_automode(args):
    """Auto mode = who approves plans. It never stops the work: /stop pauses, /resume continues."""
    arg = (args.split() or ["status"])[0].lower()
    e = read_env()
    auto = e.get("PLAN_APPROVAL", "auto") != "ask"
    running = e.get("AUTO_MODE") == "true"
    if arg not in BOOL_WORDS:
        return (f"Chế độ tự động đang **{'BẬT' if auto else 'TẮT'}** {'▶️' if auto else '✋'}\n"
                + ("- Plan ổn thì mình giao OpenCode luôn, chỉ dừng hỏi bạn khi plan có rủi ro nghiêm trọng\n" if auto else
                   "- Mỗi plan mình gửi thẻ để bạn duyệt trước khi code\n")
                + "- Ship luôn cần bạn duyệt\n"
                + f"- Hệ thống đang **{'chạy' if running else 'tạm dừng (gõ /resume để chạy tiếp)'}**\n"
                "Gõ `/automode on` hoặc `/automode off` để đổi.")
    want = BOOL_WORDS[arg] == "true"
    if want == auto:
        return f"Chế độ tự động đang {'bật' if auto else 'tắt'} rồi mà 😄 Bạn gõ `/status` để xem tiến độ nhé."
    set_env("PLAN_APPROVAL", "auto" if want else "ask")
    lines = read_board()
    log_line(lines, f"/automode {'on' if want else 'off'}: duyệt plan {'tự động' if want else 'bởi bạn'}.")
    write_board(lines)
    waiting = [t for t in tasks(lines) if t["state"] == "awaiting_plan"]
    if want:
        out = ["Đã **bật chế độ tự động** ▶️", "", "- Plan ổn thì mình giao OpenCode luôn, không hỏi bạn",
               "- Chỉ dừng hỏi khi plan có rủi ro nghiêm trọng, thiếu ngữ cảnh hoặc bị chặn (rồi làm task kế tiếp)", "- Ship vẫn cần bạn duyệt"]
        if waiting:
            out.append(f"- {len(waiting)} plan đang chờ bạn vẫn cần `/approve`, chế độ mới áp dụng cho các plan sau")
    else:
        out = ["Đã **tắt chế độ tự động** ✋ Mình vẫn làm việc bình thường, chỉ dừng ở hai chỗ:", "",
               "- **Duyệt plan:** mỗi plan mình gửi thẻ để bạn duyệt", "- **Ship:** bạn duyệt như mọi khi"]
    if not running:
        out.append("- ⏸ Hệ thống đang tạm dừng vì `/stop`, gõ `/resume` để chạy tiếp")
    return "\n".join(out)


def cmd_config(args):
    parts = args.split(None, 1)
    e = read_env()
    if not parts:
        out = ["⚙️ **Cấu hình phòng**", ""]
        for name, key, label, kind, default, why in CONFIG:
            out.append(f"- `{name}` = **{display_value(kind, config_value(e, key, default))}** · {why}")
        out += ["", "Đổi bằng `/config <khóa> <giá trị>`, ví dụ `/config approval auto`. Các cấu hình này cũng hiện trong `/status` và trên board."]
        return "\n".join(out)
    name = parts[0].lower().replace("-", "_")
    entry = next((c for c in CONFIG if name in (c[0], c[1].lower())), None)
    if not entry:
        return "Mình không đổi được `" + parts[0] + "` từ chat 🙅 Khóa hợp lệ: " + ", ".join(f"`{c[0]}`" for c in CONFIG)
    _, key, label, kind, default, why = entry
    if len(parts) < 2:
        return f"`{entry[0]}` hiện là **{display_value(kind, config_value(e, key, default))}**. {why}\nĐổi bằng `/config {entry[0]} <giá trị>`."
    raw = parts[1].strip()
    if kind == "bool":
        val = BOOL_WORDS.get(raw.lower())
        hint = "`on` hoặc `off`"
    elif kind == "model":
        val = "" if raw.lower() in ("default", "mặc định", "none", "-") else raw if re.fullmatch(r"[A-Za-z0-9._:/-]{1,80}", raw) else None
        hint = "`haiku`, `sonnet`, `opus`, một id model hoặc `default`"
    elif isinstance(kind, tuple) and isinstance(kind[0], int):
        val = raw if raw.isdigit() and kind[0] <= int(raw) <= kind[1] else None
        hint = f"một số từ {kind[0]} đến {kind[1]}"
    else:
        val = raw.lower() if raw.lower() in kind else None
        hint = " hoặc ".join(f"`{k}`" for k in kind)
    if val is None:
        return f"Giá trị `{raw}` không hợp lệ cho `{entry[0]}` 🙅 Dùng {hint}."
    before = config_value(e, key, default)
    set_env(key, val)
    lines = read_board()
    log_line(lines, f"/config {entry[0]}: {display_value(kind, before)} → {display_value(kind, val)}.")
    write_board(lines)
    note = ""
    if key == "PLAN_APPROVAL" and val == "auto" and any(t["state"] == "awaiting_plan" for t in tasks(lines)):
        note = "\nPlan đang chờ vẫn cần bạn duyệt (`/approve`), chế độ mới áp dụng cho các plan sau."
    return f"Đã đổi **{label}**: {display_value(kind, before)} → **{display_value(kind, val)}** ✅ Áp dụng từ lần kế tiếp, và đã cập nhật trên board.{note}"


def cmd_stop():
    lines = read_board()
    set_auto(lines, False, "IDLE")
    log_line(lines, "/stop: AUTO_MODE tắt, phase IDLE.")
    write_board(lines)
    return "Okê, mình dừng lại đây ⏹\nChế độ tự động đã tắt. Việc đang dở sẽ nằm yên cho tới khi bạn gõ `/resume` nha."


def unblock_task(lines, t, note=""):
    """BLOCKED -> pending again (the Tech Lead plans it anew); an optional note reaches the Tech Lead like a /revise note."""
    set_state(lines, t["id"], "pending")
    for f in glob.glob(f"{AG}/notices/skip-{t['id']}-*"):
        os.remove(f)
    if note:
        d = f"{AG}/plan-feedback"
        os.makedirs(d, exist_ok=True)
        with open(f"{d}/{t['slug']}.md", "a", encoding="utf8") as f:
            f.write(f"## Góp ý lúc {datetime.now():%Y-%m-%d %H:%M}\n{note}\n\n")


def cmd_resume(arg=""):
    """/resume: continue after a stop, a stuck task or a BLOCKED task. `/resume T03 [note]` retries ONE blocked task even while the
    room is running (a blocked task is skipped and the others carry on, so plain /resume used to answer 'already running')."""
    parts = arg.split(None, 1)
    key = parts[0].upper() if parts and re.match(r"^T\d+$", parts[0], re.I) else ""
    note = (parts[1] if key and len(parts) > 1 else "").strip()
    lines = read_board()
    running = read_env().get("AUTO_MODE") == "true"
    all_tasks = tasks(lines)
    open_tasks = [t for t in all_tasks if not t["done"]]
    busy = [t for t in all_tasks if t["state"] in ("planning", "plan_ready", "in_progress", "revise")]

    def finish(unblocked):
        for t in unblocked:
            unblock_task(lines, t, note)
        if not running:
            set_auto(lines, True, "RUNNING")
        log_line(lines, "/resume " + (", ".join(t["id"] for t in unblocked) or "") + ": " +
                 ("chạy tiếp, " if not running else "") + ("task BLOCKED chuyển lại pending." if unblocked else "AUTO_MODE bật."))
        write_board(lines)
        try:
            os.remove(f"{AG}/manager.sig")
        except FileNotFoundError:
            pass

    if key:
        t = next((x for x in all_tasks if x["id"] == key), None)
        if not t:
            return f"Mình không thấy task **{key}** trên board 🙈 Gõ `/status` để xem danh sách nhé."
        if t["state"] != "BLOCKED":
            hint = (f" Bạn trả lời bằng `/revise {key} <thông tin>` nhé." if t["state"] == "needs_info" else
                    " Plan đang chờ bạn: gõ `/approve` hoặc `/revise`." if t["state"] == "awaiting_plan" else "")
            return f"**{key}** đang ở trạng thái **{STATE_VI.get(t['state'], t['state'])}**, không bị chặn nên không cần `/resume` 🙂{hint}"
        finish([t])
        wait = f" Mình đang làm **{busy[0]['id']}**, xong sẽ tới **{key}** ngay." if busy else " Mình chạy lại ngay nè."
        return f"Thử lại **{key}** thôi! ▶️{wait}" + (" Mình đã chuyển ghi chú của bạn cho Tech Lead." if note else "")

    blocked = [t for t in open_tasks if t["state"] == "BLOCKED"]
    if running:
        if not blocked:
            return "Mình đang chạy sẵn rồi mà 😄 Bạn gõ `/status` để xem tiến độ nhé."
        finish(blocked)
        ids = ", ".join(f"**{t['id']}**" for t in blocked)
        return f"Mình đang chạy sẵn, nhưng có task bị chặn nên mình cho thử lại: {ids} ▶️" + (
            f" Mình làm xong **{busy[0]['id']}** là tới lượt." if busy else "")
    if not open_tasks:
        return "Không còn việc nào dang dở để chạy tiếp đâu 🎉"
    finish(blocked)
    return f"Tiếp tục thôi! ▶️ Còn **{len(open_tasks)} việc** chưa xong, mình chạy lại ngay nè."


def clean_item(line):
    line = line.strip()
    line = re.sub(r"^(?:[-*•]\s*)?(?:\[[ xX]\]\s*)?", "", line)
    line = re.sub(r"^\d+[.)]\s+", "", line)
    return line.strip()


def next_task_number(lines):
    """Next task number. Looks at the board, at the plan files and at the task branches, so a cleared board does not restart at T01
    (that would reuse branch and plan names of finished tasks)."""
    nums = [int(t["id"][1:]) for t in tasks(lines)]
    for f in glob.glob(f"{AG}/tasks/*task-*.md"):
        m = re.search(r"task-(\d+)-", os.path.basename(f))
        if m:
            nums.append(int(m.group(1)))
    rc, out = git("branch", "--list", "task/task-*", "--format=%(refname:short)")
    if rc == 0:
        for b in out.splitlines():
            m = re.match(r"task/task-(\d+)-", b.strip())
            if m:
                nums.append(int(m.group(1)))
    return max(nums) + 1 if nums else 1


def busy_reason():
    """Why the room must not be cleaned right now ('' when it is idle)."""
    if read_env().get("AUTO_MODE") == "true":
        return "chế độ tự động đang bật"
    for t in tasks(read_board()):
        if t["state"] in ("planning", "plan_ready", "in_progress", "revise", "approved"):
            return f"{t['id']} đang dở ({STATE_VI.get(t['state'], t['state'])})"
    for f in glob.glob(f"{AG}/status/*.status"):
        try:
            with open(f, encoding="utf8") as fh:
                if fh.read().split()[0] in ("queued", "running"):
                    return "OpenCode đang chạy"
        except (OSError, IndexError):
            pass
    if glob.glob(f"{AG}/queue/*.job*"):
        return "còn job trong hàng đợi"
    try:
        with open(f"{AG}/plan.pid", encoding="utf8") as fh:
            os.kill(int(fh.read().strip()), 0)
        return "đang trả lời một câu hỏi /plan"
    except (OSError, ValueError):
        pass
    return ""


def remove_files(patterns):
    n = 0
    for pat in patterns:
        for f in glob.glob(pat):
            if os.path.isfile(f):
                os.remove(f)
                n += 1
    return n


def cmd_clear():
    why = busy_reason()
    if why:
        return (f"Mình chưa dọn được vì phòng đang bận 🙅 ({why}).\n"
                "Bạn gõ `/stop`, đợi việc đang chạy xong rồi gõ `/clear` lại nhé.")
    lines = read_board()
    ts = tasks(lines)
    archive_dir = f"{AG}/board-archive"
    os.makedirs(archive_dir, exist_ok=True)
    archive = f"{archive_dir}/{datetime.now():%Y%m%d-%H%M%S}.md"
    shutil.copyfile(BOARD, archive)
    for old in sorted(glob.glob(f"{archive_dir}/*.md"))[:-10]:
        os.remove(old)   # keep the 10 newest copies
    title = lines[0] if lines and lines[0].startswith("# ") else "# Project Board"
    fresh = [title, "", "- **Auto Mode:** OFF", "- **Current Phase:** IDLE",
             f"- **Staging Branch:** {read_env().get('STAGING_BRANCH', 'staging')}", "", "## Checklist & Tasks", "", "## Activity Log", ""]
    log_line(fresh, f"/clear: board dọn sạch ({len(ts)} task), bản sao ở {os.path.basename(archive)}.")
    write_board(fresh)
    set_env("AUTO_MODE", "false")
    n_state = remove_files([f"{AG}/status/*", f"{AG}/progress/*", f"{AG}/queue/*"])
    n_msg = remove_files([f"{AG}/inbox/processed/*", f"{AG}/inbox/failed/*", f"{AG}/outbox/sent/*", f"{AG}/outbox/failed/*"])
    n_plan = remove_files([f"{AG}/plan/*", f"{AG}/plan-feedback/*"])
    remove_files([f"{AG}/manager.sig"])
    return ("Dọn dẹp xong nè 🧹\n\n"
            f"- **Board:** đã reset ({len(ts)} task), bản sao ở `.agents/board-archive/{os.path.basename(archive)}`. Task mới sẽ tiếp tục từ **T{next_task_number(fresh):02d}**\n"
            f"- **Đã xóa:** {n_state} file trạng thái task, {n_msg} tin cũ, {n_plan} file hỏi đáp `/plan`\n"
            "- **Không đụng tới:** cấu hình phòng, file plan trong git, ảnh, log và `usage.log` (dùng `/clearlog` để dọn log)")


def human_size(n):
    return f"{n / 1048576:.1f} MB" if n >= 1048576 else f"{n / 1024:.0f} KB" if n >= 1024 else f"{n} B"


def cmd_clearlog(args=""):
    why = busy_reason()
    if why:
        return (f"Mình chưa dọn log được vì phòng đang bận 🙅 ({why}).\n"
                "Bạn gõ `/stop`, đợi việc đang chạy xong rồi gõ `/clearlog` lại nhé.")
    keep = int(args.split()[0]) if args.split() and args.split()[0].isdigit() else 200
    files = [f"{AG}/run.log"] + sorted(glob.glob(f"{AG}/logs/*.log") + glob.glob(f"{AG}/logs/*.err"))
    freed, rows = 0, []
    for f in files:
        if os.path.basename(f) == "usage.log" or not os.path.isfile(f):
            continue   # usage.log is your cost history
        before = os.path.getsize(f)
        with open(f, encoding="utf8", errors="replace") as fh:
            tail = fh.readlines()[-keep:] if keep > 0 else []
        with open(f, "w", encoding="utf8") as fh:   # truncated in place: `tail -F` in the dashboard keeps following
            fh.writelines(tail)
        freed += before - os.path.getsize(f)
        if before > 4096:
            rows.append((before, os.path.basename(f)))
    top = "; ".join(f"`{name}` {human_size(b)}" for b, name in sorted(rows, reverse=True)[:3])
    return ("Dọn log xong nè 🧹\n\n"
            f"- **Giải phóng:** {human_size(freed)}" + (f" (lớn nhất: {top})" if top else "") + "\n"
            + (f"- Mỗi file giữ lại {keep} dòng cuối" if keep > 0 else "- Đã xóa trắng nội dung") + "\n"
            "- `usage.log` được giữ nguyên (lịch sử chi phí cho `/usage`)")


def cmd_auto(args):
    items = [clean_item(l) for l in args.splitlines()]
    items = [i for i in items if i]
    if not items:
        return "Bạn cho mình biết việc cần làm nhé 📝\nCách dùng: `/task <việc cần làm>`, mỗi dòng một việc."
    e = read_env()
    main, stg = e.get("MAIN_BRANCH", "main"), e.get("STAGING_BRANCH", "staging")
    rc, _ = git("show-ref", "--verify", "--quiet", f"refs/heads/{stg}")
    if rc != 0:
        rc, out = git("branch", stg, main)
        if rc != 0:
            return f"Ối, mình không tạo được nhánh `{stg}` từ `{main}` 😢\n{out}"
    lines = read_board()
    n = next_task_number(lines)
    marker = next((i for i, l in enumerate(lines) if l.startswith("## Activity Log")), len(lines))
    new = []
    for title in items:
        tid = f"T{n:02d}"
        new.append(f"- [ ] `{tid}` [pending] {title} (slug: `task-{n:02d}-{slugify(title) or 'task'}`)")
        n += 1
    # insert after the last task line (or right after the Checklist header)
    last = max([t["i"] for t in tasks(lines)] or
               [next((i for i, l in enumerate(lines) if l.startswith("## Checklist")), marker - 1)])
    lines[last + 1:last + 1] = new
    auto = e.get("PLAN_APPROVAL", "auto") != "ask"
    set_auto(lines, True, "RUNNING")
    log_line(lines, f"/task: thêm {len(new)} task.")
    write_board(lines)
    return ("Nhận rồi nha! 🚀 Mình ghi **" + str(len(new)) + " việc** vào board:\n\n"
            + "\n".join(f"{i + 1}. {short(t, 110)}" for i, t in enumerate(items))
            + "\n\nTech Lead sẽ lên plan ngay đây ✨ "
            + ("Plan ổn thì mình giao OpenCode luôn." if auto else "Plan nào xong mình cũng gửi thẻ để bạn duyệt."))


def cleanup_after_ship(lines, keep):
    """Tidy up after a successful /ship. Returns a short summary. Never raises."""
    out = []
    try:
        shipped = sorted([t for t in tasks(lines) if t["state"] == "shipped"], key=lambda t: int(t["id"][1:]))
        # 1. per-task runtime state of everything already shipped
        n_status = n_prog = 0
        for t in shipped:
            for f in glob.glob(f"{AG}/status/*{t['slug']}*.status"):
                os.remove(f); n_status += 1
            for pf in glob.glob(f"{PROGRESS_DIR}/{t['slug']}.*"):
                os.remove(pf); n_prog += 1
            for tf in glob.glob(f"{AG}/timeline/{t['slug']}.log"):
                os.remove(tf)
        if n_status or n_prog:
            out.append(f"{n_status} status, {n_prog} progress")
        if read_env().get("COMMIT_LINKS", "true") == "true" and repo_web_url():
            gone = sum(1 for t in shipped if git("ls-remote", "--heads", "origin", f"task/{t['slug']}")[1].strip()
                       and git_remote_cmd("push", "-q", "origin", "--delete", f"task/{t['slug']}"))
            if gone:
                out.append(f"{gone} nhánh task trên GitHub")
        # 2. verification screenshots -> archive/<stamp>/, keep the last 3 batches
        # never move files git tracks: that would leave deleted tracked files and a dirty tree (hand-off needs a clean one)
        tracked = set(git("ls-files", f"{AG}/screenshots")[1].splitlines())
        shots = [f for f in screenshots() if f not in tracked]
        if shots:
            dest = f"{AG}/screenshots/archive/{datetime.now():%Y%m%d-%H%M}"
            for f in shots:
                rel = os.path.relpath(f, f"{AG}/screenshots")
                os.makedirs(os.path.dirname(os.path.join(dest, rel)), exist_ok=True)
                shutil.move(f, os.path.join(dest, rel))
            out.append(f"{len(shots)} ảnh → archive")
        arch = sorted(glob.glob(f"{AG}/screenshots/archive/*/"))
        for d in arch[:-3]:
            shutil.rmtree(d, ignore_errors=True)
        # 3. board: keep the newest `keep` shipped tasks, summarize the rest in the Activity Log
        old = shipped[:-keep] if keep > 0 and len(shipped) > keep else []
        if old:
            for t in sorted(old, key=lambda t: t["i"], reverse=True):
                del lines[t["i"]]
            log_line(lines, f"Dọn board: gỡ {', '.join(t['id'] for t in old)} (đã ship).")
            out.append(f"board gỡ {len(old)} task cũ")
        # 4. message files older than 7 days
        cutoff, n_old = time.time() - 7 * 86400, 0
        for d in ("inbox/processed", "inbox/failed", "outbox/sent", "outbox/failed"):
            for f in glob.glob(f"{AG}/{d}/*.json"):
                if os.path.getmtime(f) < cutoff:
                    os.remove(f); n_old += 1
        if n_old:
            out.append(f"{n_old} tin cũ")
    except Exception as e:  # cleanup must never break a ship
        out.append(f"lỗi khi dọn ({e})")
    return ", ".join(out)


def fmt_dur(sec):
    sec = int(round(sec))
    if sec < 60:
        return f"{sec}s"
    m, s = divmod(sec, 60)
    if m < 60:
        return f"{m}m {s:02d}s"
    h, m = divmod(m, 60)
    return f"{h}h {m:02d}m"


def task_timeline(slug):
    """Phase durations of one task from .agents/timeline/<slug>.log (lines '<epoch> <event>', written by the daemon and the watcher).
    plan = Tech Lead planning calls (+ time spent waiting for the user before the first hand-off), code = OpenCode running,
    verify = Tech Lead verify/review/merge calls. None when nothing was recorded (a task from before this existed)."""
    ev = []
    try:
        with open(f"{AG}/timeline/{slug}.log", encoding="utf8") as f:
            for line in f:
                p = line.split()
                if len(p) == 2 and p[0].isdigit():
                    ev.append((int(p[0]), p[1]))
    except OSError:
        return None
    ev.sort(key=lambda x: x[0])

    def spans(kind):
        out, start = [], None
        for ts, name in ev:
            if name == f"{kind}_start":
                start = ts
            elif name == f"{kind}_end" and start is not None:
                out.append((start, ts)); start = None
        return out

    plan, code, fin = spans("plan"), spans("code"), spans("finish")
    if not (plan or code or fin):
        return None
    begin = min(s for s, _ in plan + code + fin)
    end = max(e for _, e in plan + code + fin)
    first_code = code[0][0] if code else None
    plan_active = sum(e - s for s, e in plan)
    plan_span = (first_code - plan[0][0]) if plan and first_code and first_code >= plan[0][0] else plan_active
    return {"begin": begin, "end": end, "total": end - begin, "plan": plan_active, "wait": max(0, plan_span - plan_active),
            "code": sum(e - s for s, e in code), "verify": sum(e - s for s, e in fin), "fixes": max(0, len(code) - 1)}


def timeline_block(shipped_tasks):
    """The 'Thời gian' block of the /ship message: one entry per shipped task that has a timeline, plus the whole range."""
    rows, begins, ends = [], [], []
    for t in shipped_tasks:
        tl = task_timeline(t["slug"])
        if not tl:
            continue
        b, e = datetime.fromtimestamp(tl["begin"]), datetime.fromtimestamp(tl["end"])
        begins.append(tl["begin"]); ends.append(tl["end"])
        when = f"{b:%H:%M} → {e:%H:%M}" + ("" if b.date() == e.date() else f" ({e:%d/%m})")
        plan = f"Plan {fmt_dur(tl['plan'])}" + (f" (+ chờ bạn {fmt_dur(tl['wait'])})" if tl["wait"] >= 30 else "")
        parts = [plan, f"Code {fmt_dur(tl['code'])}", f"Test/Verify {fmt_dur(tl['verify'])}"]
        if tl["fixes"]:
            parts.append(f"{tl['fixes']} vòng sửa")
        rows.append(f"- **{t['id']}** · tổng **{fmt_dur(tl['total'])}** · {when}, {b:%d/%m}\n  " + " · ".join(parts))
    if not rows:
        return ""
    out = "⏱ **Thời gian**\n" + "\n".join(rows[:8])
    if len(rows) > 8:
        out += f"\n- … và {len(rows) - 8} task nữa"
    if len(rows) > 1:
        out += f"\n\nCả đợt: {datetime.fromtimestamp(min(begins)):%H:%M %d/%m} → {datetime.fromtimestamp(max(ends)):%H:%M %d/%m}"
    return out


def cmd_ship():
    lines = read_board()
    phase = get_phase(lines)
    if phase != "AWAITING_SHIP_APPROVAL":
        return f"Chưa có gì chờ duyệt ship hết (đang ở giai đoạn **{phase}**) 🙈"
    e = read_env()
    main, stg = e.get("MAIN_BRANCH", "main"), e.get("STAGING_BRANCH", "staging")
    rc, out = git("status", "--porcelain")
    if out:
        return ("Khoan đã, mình chưa ship được vì cây git còn file chưa commit ⚠️\n"
                + "\n".join(f"- `{l[3:].strip()}`" for l in out.splitlines()[:8])
                + "\nBạn commit hoặc bỏ mấy file này rồi gõ `/ship` lại nhé.")
    has_remote = bool(git("remote")[1])
    rc, out = git("checkout", main)
    if rc != 0:
        return f"Ối, mình không chuyển sang được nhánh `{main}` 😢\n{out[:300]}"
    try:
        if has_remote:
            rc, out = git("pull", "--ff-only")
            if rc != 0:
                return f"Mình chưa ship được: `git pull --ff-only` báo lỗi 😢\n{out[:400]}\nBạn xem giúp mình nhé, mình không tự ép đâu."
        shipping = [t for t in tasks(lines) if t["state"] == "done"]
        subject = (f"Ship {shipping[0]['id']}: {short(shipping[0]['title'], 60)}" if len(shipping) == 1 else
                   f"Ship {len(shipping)} task: " + ", ".join(t["id"] for t in shipping[:6]) + (" …" if len(shipping) > 6 else ""))
        body = "\n".join(f"- {t['id']}: {short(t['title'], 120)}" for t in shipping)
        rc, out = git("merge", "--no-ff", stg, "-m", subject, "-m", f"Merge {stg} into {main}.\n\n{body}")
        if rc != 0:
            git("merge", "--abort")
            return f"Merge bị lỗi nên mình đã huỷ luôn, chưa đổi gì hết nha 🙏\n{out[:400]}"
        sha = git("rev-parse", "--short", "HEAD")[1]
        msg = f"Ship xong rồi nè! 🚀 Mình đã merge `{stg}` vào `{main}` (`{sha}`)."
        if has_remote:
            rc, out = git("push", "origin", main)
            msg += " Đã push lên remote luôn." if rc == 0 else f"\n⚠️ Merge xong rồi nhưng push bị lỗi: {out[:300]}"
        timing = timeline_block(shipping)   # before cleanup removes the timeline files
        lines = read_board()
        for t in tasks(lines):
            if t["state"] == "done":
                set_state(lines, t["id"], "shipped")
        set_header(lines, "Current Phase", "SHIPPED")
        log_line(lines, f"/ship: merge {stg} vào {main} ({sha}).")
        try:
            keep = int(read_env().get("KEEP_SHIPPED", "5"))
        except ValueError:
            keep = 5
        cleaned = cleanup_after_ship(lines, keep)
        write_board(lines)
        return msg + (f"\n\n{timing}" if timing else "") + (f"\n\n🧹 **Dọn dẹp xong:** {cleaned}." if cleaned else "")
    finally:
        git("checkout", stg)


def plan_path(slug):
    files = [f for f in glob.glob(f"{AG}/tasks/*{slug}*.md") if "_TEMPLATE" not in f]
    if not files:
        rc, out = git("ls-tree", "-r", "--name-only", f"task/{slug}", f"{AG}/tasks/")
        files = [f for f in out.splitlines() if slug in f and "_TEMPLATE" not in f] if rc == 0 else []
    return sorted(files, key=lambda f: os.path.getmtime(f) if os.path.exists(f) else 0)[-1] if files else ""


def ensure_plan_on_disk(slug):
    p = plan_path(slug)
    if p and not os.path.exists(p):
        git("checkout", f"task/{slug}")
    return plan_path(slug)


def cmd_check_plan(slug):
    p = ensure_plan_on_disk(slug)
    if not p or not os.path.exists(p):
        return "BLOCK: không thấy file plan của task"
    text = "\n".join(l for l in open(p, encoding="utf8").read().split("\n") if not l.lstrip().startswith("<!--"))
    steps = re.findall(r"^- \[[ x]\] \d+\. .*$", text, re.M)
    if not steps:
        return "BLOCK: plan không có bước nào theo mẫu '- [ ] N. [dễ|vừa|khó] ...'"
    if re.search(r"(?<![\w.])\.env(?!\.example)(\.[\w.]+)?\b", text):
        return "BLOCK: plan đụng tới file .env"
    if re.search(r"DROP\s+(TABLE|DATABASE|SCHEMA)|TRUNCATE\s|DELETE\s+FROM", text, re.I):
        return "BLOCK: plan có thao tác xoá dữ liệu (DROP/TRUNCATE/DELETE FROM)"
    review, critical = [], []
    if len(steps) > 8:
        review.append(f"plan có {len(steps)} bước (>8)")
    if any(not re.match(r"^- \[[ x]\] \d+\. \[(dễ|vừa|khó)\]", s) for s in steps):
        review.append("có bước thiếu nhãn độ khó")
    if re.search(r"secret|credential|private[_ ]key|api[_ -]?key|\.pem\b", text, re.I):
        critical.append("nhắc tới secret/credential/key")
    if re.search(r"migrat", text, re.I):
        critical.append("có migration")
    if re.search(r"\.github/workflows|Dockerfile|docker-compose|\bdeploy", text, re.I):
        critical.append("đụng cấu hình CI/deploy")
    if re.search(r"package-lock\.json|pnpm-lock\.yaml|yarn\.lock", text):
        review.append("đụng lockfile")
    if re.search(r"rm\s+-rf", text):
        critical.append("có rm -rf")
    none_mode = re.search(r"^Verify mode:\s*none", text, re.M | re.I)
    if not none_mode and not re.search(r"\b(npm|npx|pnpm|yarn|pytest|vitest|jest|playwright|go test|cargo test|make test)\b", text):
        review.append("không thấy lệnh test cụ thể")
    if critical:   # serious: with PLAN_APPROVAL=auto the plan is held for the user instead of being approved
        return "CRITICAL: " + "; ".join(critical + review)
    return "REVIEW: " + "; ".join(review) if review else "OK"


def cmd_approve(slug, by_user=False):
    lines = read_board()
    t = next((t for t in tasks(lines) if t["slug"] == slug), None)
    if not t:
        return "ERROR: không thấy task trên board"
    p = ensure_plan_on_disk(slug)
    branch = f"task/{slug}"
    if git("rev-parse", "--abbrev-ref", "HEAD")[1] != branch:
        rc, out = git("checkout", branch)
        if rc != 0:
            return cmd_block(t["id"], f"không checkout được {branch}: {out[:200]}")
    if p and "APPROVED_BY_" not in open(p, encoding="utf8").read():
        body = open(p, encoding="utf8").read().split("\n")
        body[1:1] = ["", "APPROVED_BY_USER" if by_user else "APPROVED_BY_MANAGER"]
        open(p, "w", encoding="utf8").write("\n".join(body))
        git("add", p)
        rc, out = git("commit", "-m", f"plan: approved {slug}")
        if rc != 0:
            return cmd_block(t["id"], f"commit duyệt plan lỗi: {out[:200]}")
    # Báo user TRƯỚC khi hand-off: ngay khi job vào queue, watcher có thể gửi "Bắt đầu code" trong vòng vài giây,
    # nên tin này phải nằm trong outbox trước đó để thứ tự hiển thị đúng.
    emit("manager", f"Bạn đã duyệt plan **{t['id']}** ✅ Mình giao cho OpenCode ngay nè 🚀" if by_user else
         f"Plan **{t['id']}** ổn áp rồi, mình duyệt và giao cho OpenCode nhé ✅")
    pr = subprocess.run(["scripts/handoff.sh", p], capture_output=True, text=True)
    if pr.returncode != 0:
        return cmd_block(t["id"], "hand-off lỗi: " + (pr.stdout + pr.stderr).strip()[-300:])
    lines = read_board()
    set_state(lines, t["id"], "in_progress")
    log_line(lines, f"{t['id']}: plan được {'bạn duyệt' if by_user else 'duyệt tự động'}, đã giao OpenCode.")
    write_board(lines)
    return f"✅ {t['id']}: plan đã duyệt, giao cho OpenCode."


NO_PLAN_WAITING = "Không có plan nào đang chờ bạn duyệt 🤷\nKhi Tech Lead lên plan xong, mình sẽ gửi thẻ để bạn duyệt nhé."


def awaiting_task(key="", states=("awaiting_plan",)):
    ts = [t for t in tasks(read_board()) if t["state"] in states]
    if key:
        ts = [t for t in ts if t["id"] == key.upper()]
    return ts[0] if ts else None


def cmd_plan_approve(arg):
    t = awaiting_task((arg.split() or [""])[0])
    if not t:
        return NO_PLAN_WAITING
    lines = read_board()
    busy = [x for x in tasks(lines) if x["state"] in ("planning", "plan_ready", "in_progress", "revise")]
    if busy:   # one task at a time in the working tree: queue it, the daemon hands it off when its turn comes
        set_state(lines, t["id"], "approved")
        log_line(lines, f"{t['id']}: bạn duyệt plan, chờ {busy[0]['id']} xong.")
        write_board(lines)
        return f"Đã duyệt plan **{t['id']}** ✅ Mình đang làm **{busy[0]['id']}**, xong sẽ làm tới task này ngay."
    r = cmd_approve(t["slug"], by_user=True)
    if r.startswith("✅"):
        lines = read_board()
        set_header(lines, "Current Phase", "RUNNING")
        write_board(lines)
        return ""   # cmd_approve already told the user
    return r


def cmd_plan_reject(arg):
    t = awaiting_task((arg.split() or [""])[0], ("awaiting_plan", "needs_info"))
    if not t:
        return NO_PLAN_WAITING
    lines = read_board()
    set_state(lines, t["id"], "cancelled")
    others = [x for x in tasks(lines) if not x["done"]]
    set_header(lines, "Current Phase", "RUNNING" if others else "IDLE")
    log_line(lines, f"{t['id']}: bạn hủy plan.")
    write_board(lines)
    return (f"Đã hủy **{t['id']}** 🚫 Nhánh `task/{t['slug']}` vẫn còn nếu bạn muốn xem lại plan." +
            (f"\nMình tiếp tục với {others[0]['id']} nhé." if others else ""))


def cmd_plan_revise(arg):
    parts = arg.split(None, 1)
    key = parts[0] if parts and re.match(r"^T\d+$", parts[0], re.I) else ""
    feedback = (parts[1] if key and len(parts) > 1 else "" if key else arg).strip()
    t = awaiting_task(key, ("awaiting_plan", "needs_info"))
    if not t:
        return NO_PLAN_WAITING
    if not feedback:
        return f"Bạn muốn sửa gì ở plan **{t['id']}**? Gõ `/revise <góp ý>` nhé ✏️"
    d = f"{AG}/plan-feedback"
    os.makedirs(d, exist_ok=True)
    with open(f"{d}/{t['slug']}.md", "a", encoding="utf8") as f:
        f.write(f"## Góp ý lúc {datetime.now():%Y-%m-%d %H:%M}\n{feedback}\n\n")
    lines = read_board()
    needs_info = t["state"] == "needs_info"
    set_state(lines, t["id"], "pending" if needs_info else "revise")   # no plan exists yet when context was missing
    set_header(lines, "Current Phase", "RUNNING")
    log_line(lines, f"{t['id']}: bạn " + ("bổ sung thông tin." if needs_info else "yêu cầu sửa plan."))
    write_board(lines)
    if needs_info:
        for f in glob.glob(f"{AG}/notices/skip-{t['id']}-*"):
            os.remove(f)
        return f"Cảm ơn bạn, mình nhờ Tech Lead lên plan **{t['id']}** lại với thông tin này nha 🙏"
    try:   # the card must be sent again for the revised plan
        pf = f"{PROGRESS_DIR}/{t['slug']}.json"
        with open(pf, encoding="utf8") as f:
            st = json.load(f)
        st["plan"] = False
        with open(pf, "w", encoding="utf8") as f:
            json.dump(st, f, ensure_ascii=False)
    except (OSError, ValueError):
        pass
    return f"Mình nhờ Tech Lead sửa plan **{t['id']}** theo góp ý của bạn nha ✏️\nXong mình sẽ gửi lại thẻ để bạn duyệt."


def cmd_review_note(task_id, reasons):
    """After the Manager (Claude) looked at a plan the automatic check doubted: if it was approved, tell the user what the doubt was."""
    t = next((t for t in tasks(read_board()) if t["id"] == task_id), None)
    if not t or t["state"] not in ("in_progress", "done"):
        return ""   # blocked or still waiting: the block message (or nothing yet) says enough
    items = [r.strip() for r in re.split(r";\s*", reasons) if r.strip()]
    emit("manager", f"Plan **{task_id}** có vài điểm mình xem kỹ trước khi duyệt 👀\n\n**Lý do kiểm tra kỹ**\n" + "\n".join(f"- {i}" for i in items)
         + "\n\nMình thấy ổn nên đã duyệt và giao OpenCode. Bạn cứ đọc lại plan nếu muốn nhé.")
    return "ok"


def mark_notice(kind):
    os.makedirs(f"{AG}/notices", exist_ok=True)
    open(f"{AG}/notices/{kind}", "w").close()


def cmd_skipped_notice():
    """Tell the user, once, about each task the queue is passing over (blocked, or missing context). Needs PLAN_APPROVAL=auto."""
    n = 0
    for t in tasks(read_board()):
        if t["done"] or t["state"] not in ("BLOCKED", "needs_info"):
            continue
        kind = f"skip-{t['id']}-{t['state']}"
        if os.path.exists(f"{AG}/notices/{kind}"):
            continue
        mark_notice(kind)
        if t["state"] == "needs_info":
            qf = f"{AG}/plan-feedback/{t['slug']}.question.md"
            q = open(qf, encoding="utf8").read().strip() if os.path.exists(qf) else "Tech Lead chưa ghi rõ câu hỏi, bạn hỏi lại bằng `/plan`."
            emit("techlead", f"Mình thiếu ngữ cảnh để lên plan **{t['id']}** ❓\n\n{q}\n\nBạn trả lời bằng `/revise {t['id']} <thông tin>` để mình lập plan lại, hoặc `/reject {t['id']}` để bỏ. Trong lúc đó mình làm task kế tiếp nhé.")
        else:
            emit("manager", f"**{t['id']}** đang bị chặn 🚧 nên mình bỏ qua và làm task kế tiếp. Xem `board.md` và log, khi muốn thử lại bạn gõ `/resume`.")
        n += 1
    return n


def cmd_block(task_id, reason):
    lines = read_board()
    set_state(lines, task_id, "BLOCKED")
    others = [t for t in tasks(lines) if t["id"] != task_id and t["state"] in ("pending", "approved", "planning", "plan_ready", "in_progress", "revise")]
    carry_on = read_env().get("PLAN_APPROVAL", "auto") != "ask" and bool(others)
    if not carry_on:
        set_auto(lines, False, "BLOCKED")
    log_line(lines, f"{task_id}: BLOCKED — {reason}")
    write_board(lines)
    mark_notice(f"skip-{task_id}-BLOCKED")
    msg = (f"Ối, **{task_id}** bị chặn rồi 🚧\n\n**Lý do:** {reason}\n\n" +
           (f"Mình bỏ qua task này và chuyển sang **{others[0]['id']}** nhé. Khi muốn thử lại bạn gõ `/resume`." if carry_on else
            "Mình tắt chế độ tự động rồi. Bạn xem plan và log, sau đó gõ `/resume` để chạy lại hoặc `/stop` để dừng nhé."))
    emit("manager", msg)
    return msg


def is_task_shot(t, path):
    """True when the file belongs to task t: named task-NN-* (NN = its number) or carrying its slug.
    Nothing else counts, so shots of other tasks or of the tooling never reach this task's report."""
    base = os.path.basename(path)
    return base.startswith(f"task-{int(t['id'][1:]):02d}-") or t["slug"] in base


def task_screenshots(t, limit=4, recorded=None):
    """Screenshots of this task only: those recorded when its Verify result was reported, plus files named
    task-NN-* / containing its slug. Never anything else in the folder, whatever their mtime."""
    found = set()
    if recorded is not None:
        found |= {x for x in recorded if os.path.exists(x)}
    else:
        try:
            with open(f"{PROGRESS_DIR}/{t['slug']}.json", encoding="utf8") as f:
                found |= {x for x in json.load(f).get("task_shots", []) if os.path.exists(x)}
        except (OSError, ValueError):
            pass
    for f in screenshots():
        if is_task_shot(t, f):
            found.add(f)
    return sorted((x for x in found if "/archive/" not in x), key=os.path.getmtime)[-limit:]


def verify_info(t):
    """(verify mode, last VERIFY result) read from the task's plan file."""
    mode, result = "light", ""
    for f in glob.glob(f"{AG}/tasks/*{t['slug']}*.md"):
        text = open(f, encoding="utf8").read()
        mode = (re.findall(r"^Verify mode:\s*(\w+)", text, re.M) or [mode])[0]
        result = (re.findall(r"^VERIFY:\s*(PASS|FAIL)", text, re.M) or [result])[-1]
    return mode, result


def merge_check(main, stg):
    """What /ship will run into: conflicts (dry-run merge) and commits that exist on main but not on staging."""
    out = []
    rc, res = git("merge-tree", "--write-tree", "--name-only", main, stg)
    if rc == 0:
        out.append(f"✅ `{main}` và `{stg}` merge sạch, `/ship` sẽ không xung đột")
    elif rc == 1:
        files = []
        for line in res.splitlines()[1:]:
            if not line.strip():
                break
            files.append(line.strip())
        out.append("⚠️ `/ship` sẽ **xung đột** ở: " + ", ".join(f"`{f}`" for f in files[:6]) + ". Bạn nên xử lý trước khi ship")
    # any other exit code: git too old for merge-tree --write-tree, say nothing rather than guess
    rc, n = git("rev-list", "--count", f"{stg}..{main}")
    if rc == 0 and n.strip().isdigit() and int(n) > 0:
        out.append(f"ℹ️ `{main}` có {n.strip()} commit mà `{stg}` chưa có")
    return out


def task_quality(t):
    """(fix cycles, model escalations) recorded while the task ran."""
    fixes = esc = 0
    try:
        with open(f"{PROGRESS_DIR}/{t['slug']}.json", encoding="utf8") as f:
            fixes = len(json.load(f).get("fix", []))
    except (OSError, ValueError):
        pass
    try:
        with open(f"{PROGRESS_DIR}/{t['slug']}.esc", encoding="utf8") as f:
            esc = len([l for l in f if l.strip()])
    except OSError:
        pass
    return fixes, esc


def batch_cost(done):
    """Claude cost (API list price) of the calls labelled with the batch's task ids (plan, verify, review, merge)."""
    ids = [t["id"] for t in done]
    total = 0.0
    for r in usage_rows():
        if any(str(r.get("label", "")).startswith(i + " ") for i in ids):
            total += r.get("cost_usd", 0) or 0
    return total


def cmd_finalize():
    lines = read_board()
    e = read_env()
    main, stg = e.get("MAIN_BRANCH", "main"), e.get("STAGING_BRANCH", "staging")
    done = [t for t in tasks(lines) if t["state"] == "done"]
    out = ["Xong hết rồi nè! 🎉 Giờ chỉ còn chờ bạn duyệt ship thôi.", "", "**Việc đã hoàn thành**"]
    evidence = []   # (task, images) in task order; sent first so the Ship button ends up at the bottom
    task_notes_out = []
    for t in done:
        mode, result = verify_info(t)
        imgs = task_screenshots(t)
        if imgs and progress_flag(t["slug"], "reported_images"):
            note = f"Verify {result or mode} · 📸 {len(imgs)} ảnh trong báo cáo {t['id']} ở trên"   # already sent with the task report
        elif imgs:
            note = f"Verify {result or mode} · 📸 {len(imgs)} ảnh ở trên"
            evidence.append((t, imgs, result or mode))
        elif mode == "none":
            note = "Verify bỏ qua (task không ảnh hưởng giao diện), không có ảnh"
        else:
            note = f"Verify {result or mode}, không có ảnh chụp"
        notes = task_notes(plan_text(t["slug"]))
        fixes, esc = task_quality(t)
        extra = ([f"⚠️ {len(notes)} lưu ý"] if notes else []) + ([f"{fixes} vòng sửa"] if fixes else []) + ([f"{esc} lần leo thang model"] if esc else [])
        out.append(f"- **{t['id']}** · {short(t['title'], 90)} · {note}" + (" · " + " · ".join(extra) if extra else ""))
        if notes:
            task_notes_out.append((t, notes))
    if task_notes_out:
        out += ["", "**Lưu ý cần xem trước khi duyệt**"]
        for t, notes in task_notes_out:
            out += [f"- **{t['id']}**: {short(n, 170)}" for n in notes[:3]]
            if len(notes) > 3:
                out.append(f"  … và {len(notes) - 3} lưu ý nữa trong báo cáo của {t['id']}")
    checks = merge_check(main, stg)
    if checks:
        out += ["", "**Trước khi ship**"] + [f"- {c}" for c in checks]
    cost = batch_cost(done)
    if cost > 0:
        out += ["", f"**Chi phí Claude của batch này:** ~${cost:.2f} (giá list API, chưa gồm OpenCode)"]
    rc, log = git("log", "--oneline", f"{main}..{stg}")
    if rc == 0 and log:
        out += ["", f"**Commit mới trên nhánh {stg}** (chưa có trong {main})"] + [f"- `{l.split(' ', 1)[0]}` {short(l.split(' ', 1)[1] if ' ' in l else '', 90)}" for l in log.splitlines()[:15]]
    out += ["", "Bấm **Ship** hoặc gõ `/ship` để mình đưa lên `main` nhé, còn muốn giữ lại thì gõ `/stop` 💌"]
    # Pictures first, each batch introduced by the task it belongs to (they are what the Tech Lead captured while verifying it)
    for t, imgs, res in evidence:
        emit("techlead", f"📸 **{t['id']}** · {short(t['title'], 80)}\nẢnh mình chụp lúc verify task này (Verify {res})", images=imgs)
    set_auto(lines, False, "AWAITING_SHIP_APPROVAL")
    log_line(lines, "FINALIZE: tất cả task done, chờ /ship.")
    write_board(lines)
    emit("manager", "\n".join(out), requires="APPROVE_SHIP")
    return "finalize"



# ---------- progress reports (derived from the task file, board and git; no AI) ----------
PROGRESS_DIR = f"{AG}/progress"
STEP_RE = re.compile(r"^- \[([ x])\] (\d+)\. (?:\[(dễ|vừa|khó)\]\s*)?(.*)$", re.M)
IMG_EXT = ("*.png", "*.jpg", "*.jpeg", "*.webp")


def plan_text(slug):
    p = plan_path(slug)
    if p and os.path.exists(p):
        with open(p, encoding="utf8") as f:
            return f.read()
    if p:
        rc, out = git("show", f"task/{slug}:{p}")
        if rc == 0:
            return out
    return ""


def section_lines(text, name):
    out, on = [], False
    for line in text.split("\n"):
        if line.startswith("## "):
            on = line.strip() == f"## {name}"
            continue
        if on and line.strip() and not line.lstrip().startswith("<!--"):
            out.append(line.rstrip())
    return out


def short(s, n=100):
    s = re.sub(r"\s+", " ", s).strip()
    if len(s) <= n:
        return s
    cut = s[: n - 1]
    if " " in cut[n // 2:]:
        cut = cut[: cut.rfind(" ")]
    cut = cut.rstrip(" ,;:-(")
    if cut.count("`") % 2:
        cut += "`"
    if cut.count("**") % 2:
        cut += "**"
    return cut + "…"


def task_commits(slug, stg):
    rc, out = git("log", "--reverse", "--format=%h\t%s", f"{stg}..task/{slug}")
    if rc != 0:
        return []
    return [tuple(l.split("\t", 1)) for l in out.splitlines() if "\t" in l]


def screenshots():
    files = []
    for ext in IMG_EXT:
        files += glob.glob(f"{AG}/screenshots/**/{ext}", recursive=True)
    return sorted({f for f in files if "/archive/" not in f}, key=os.path.getmtime)


SETTLE_S = 8   # a step is reported only after its task file has been quiet this long, so the commit and test results are in


def repo_web_url():
    """https://github.com/owner/repo from the origin remote, or '' when it is not a GitHub repo."""
    rc, out = git("remote", "get-url", "origin")
    m = re.match(r"(?:https://(?:[^@/]+@)?github\.com/|git@github\.com:)([^/]+/[^/]+?)(?:\.git)?/?$", out.strip()) if rc == 0 else None
    return f"https://github.com/{m.group(1)}" if m else ""


def git_remote_cmd(*args, timeout=40):
    """git talking to the remote: never prompts for a password and never hangs the daemon."""
    try:
        p = subprocess.run(["git", *args], capture_output=True, text=True, timeout=timeout,
                           env={**os.environ, "GIT_TERMINAL_PROMPT": "0"})
        if p.returncode != 0:   # keep the reason: the user-facing notice cannot say what went wrong
            print(f"git {' '.join(args)} failed: {(p.stdout + p.stderr).strip()[-300:]}", file=sys.stderr)
        return p.returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


def notify_once(kind, text, every_s=1800):
    """Tell the user about a problem that would otherwise only be logged, at most once per `every_s` seconds per kind."""
    d = f"{AG}/notices"
    os.makedirs(d, exist_ok=True)
    f = f"{d}/{kind}"
    if os.path.exists(f) and time.time() - os.path.getmtime(f) < every_s:
        return False
    open(f, "w").close()
    emit("manager", text)
    return True


NOTE_RE = re.compile(r"^\s*(?:[-*•]\s*)?\**\s*(?:lưu ý|cảnh báo|warning|note)\b[^:\n]{0,24}:\s*\**\s*(.+)$", re.I)


def task_notes(text):
    """Warnings and notes the agents wrote for the person who approves: lines starting with 'Lưu ý:' / 'Cảnh báo:' / 'Warning:' /
    'Note:' in 'Trạng thái hiện tại' or 'Verify', everything in an optional '## Lưu ý' section, and what is in 'Đã thử mà không được'.
    Only explicit markers count: nothing is guessed."""
    notes = []
    for name in ("Trạng thái hiện tại", "Verify"):
        for line in section_lines(text, name):
            m = NOTE_RE.match(line)
            if m:
                notes.append(m.group(1).strip())
    for line in section_lines(text, "Lưu ý"):
        body = line.lstrip("-*• ").strip()
        if body:
            notes.append(body)
    for line in section_lines(text, "Đã thử mà không được"):
        body = line.lstrip("-*• ").strip()
        if body:
            notes.append("Đã thử không được: " + body)
    seen, out = set(), []
    for n in notes:
        if n and n not in seen:
            seen.add(n)
            out.append(short(n, 220))
    return out


def push_branch(branch, st, key="push_retry_at"):
    """Push a branch so the commit links in a report open on GitHub. Returns True when the links will work."""
    if read_env().get("COMMIT_LINKS", "true") != "true" or not repo_web_url():
        return False
    if time.time() < st.get(key, 0):
        return False
    if git("show-ref", "--verify", "--quiet", f"refs/heads/{branch}")[0] != 0:
        # The Tech Lead deletes the local task branch after the squash merge. Nothing is left to push: the links still work
        # if the branch is on the remote (it is deleted at /ship). This is not a login problem, so say nothing to the user.
        return bool(git("ls-remote", "--heads", "origin", branch)[1].strip())
    if git_remote_cmd("push", "-q", "origin", branch):
        return True
    st[key] = time.time() + 600   # offline or no rights: do not retry on every tick
    notify_once("push-failed", "Mình chưa push được nhánh lên GitHub nên các báo cáo tạm thời **không có link commit** 🔗\nBạn kiểm tra giúp mình đăng nhập git và quyền ghi của repo nhé. "
                "Muốn tắt hẳn việc push này thì đặt `COMMIT_LINKS=\"false\"` trong `.agents/room.env`.", 6 * 3600)
    return False


def push_task_branch(slug, st):
    return push_branch(f"task/{slug}", st)


def progress_flag(slug, key):
    try:
        with open(f"{PROGRESS_DIR}/{slug}.json", encoding="utf8") as f:
            return bool(json.load(f).get(key))
    except (OSError, ValueError):
        return False


def plan_mtime(slug):
    p = plan_path(slug)
    return os.path.getmtime(p) if p and os.path.exists(p) else 0


def step_report(slug, total, done_steps, commits, changed, linked, notes=None, tid=""):
    """ONE message per finished step(s): what the step was (with difficulty), commits (linked), test results. There is no separate start message."""
    base = repo_web_url()
    nums = ", ".join(str(x[0]) for x in done_steps)
    who = f"{tid} · " if tid else ""   # several tasks can be in flight: every message names its task
    out = [f"✅ **{who}Bước {nums}/{total}** xong rồi nè!" if len(done_steps) == 1 else
           f"✅ **{who}Bước {nums}/{total}** xong hết rồi nè!" if done_steps else f"📝 **{who}Phần còn lại** của task"]
    if done_steps:
        out += ["", "**Mô tả**"]
        for n, _, label, txt in done_steps:
            out.append(f"- **Bước {n}** · mức **{label or 'vừa'}**")
            out.append(f"  {short(txt, 200)}")
    # With finished steps the Commit/Test sections always show (an honest "none yet"); the leftover report shows only what exists.
    if commits or done_steps:
        out += ["", "**Commit**"]
        if commits:
            for h, sub in commits[:8]:
                out.append(f"- [{h}]({base}/commit/{h}) {short(sub, 90)}" if linked and base else f"- `{h}` {short(sub, 90)}")
            if len(commits) > 8:
                out.append(f"- … và {len(commits) - 8} commit nữa")
        else:
            out.append("- Bước này chưa có commit mới")
    if changed or done_steps:
        out += ["", "**Kết quả test**"]
        if changed:
            out += [f"- {k} {'✅ PASS' if v == 'PASS' else '❌ FAIL'}" for k, v in changed]
        else:
            out.append("- Bước này chưa có test nào đổi kết quả")
    if notes:
        out += ["", "**Lưu ý**"] + [f"- ⚠️ {short(n, 200)}" for n in notes[:5]]
    return "\n".join(out)


VERIFY_MEANING = {"none": "bỏ qua (task không ảnh hưởng giao diện)", "light": "nhẹ (chạy test, chụp ảnh phần test không kiểm được)",
                  "full": "đầy đủ (thêm kịch bản biên, tối đa 3 test mới)"}


def bullet_lines(text, section, limit):
    out = []
    for l in section_lines(text, section):
        b = l.lstrip("-*• ").strip()
        if b and not l.startswith("  "):
            out.append(short(b, 200))
    return out[:limit]


def plan_card_text(t, text, steps, verdict, ask, held=False):
    """The full picture of a plan for the person who approves it, built only from the task file (no AI)."""
    mode = (re.findall(r"^Verify mode:\s*(\w+)", text, re.M) or ["light"])[0]
    out = [f"📋 **Plan {t['id']}** · {short(t['title'], 90)}", "",
           ("⚠️ Plan này có rủi ro nghiêm trọng nên mình **giữ lại chờ bạn duyệt**. Mình làm task kế tiếp trước, bạn duyệt lúc nào thì task này chạy lúc đó." if held else
            "Tech Lead đã lên plan xong, mời bạn xem và duyệt 👀") if ask else
           "Tech Lead đã lên plan xong. Phòng đang ở chế độ tự duyệt nên mình kiểm tra rồi giao OpenCode luôn."]
    for title, sec, n in (("Mục tiêu", "Mục tiêu", 6), ("Ý tưởng", "Ý tưởng", 5), ("Quyết định đã chốt", "Quyết định đã chốt", 5)):
        rows = bullet_lines(text, sec, n)
        if rows:
            out += ["", f"**{title}**"] + [f"- {r}" for r in rows]
    counts = {k: sum(1 for x in steps if (x[2] or "vừa") == k) for k in ("khó", "vừa", "dễ")}
    out += ["", f"**Các bước** ({len(steps)} · {counts['khó']} khó · {counts['vừa']} vừa · {counts['dễ']} dễ)"]
    for n, _, label, txt in steps[:12]:
        out.append(f"{n}. **{label or 'vừa'}** · {short(txt, 220)}")
    if len(steps) > 12:
        out.append(f"… và {len(steps) - 12} bước nữa")
    cases = [m.groups() for m in (re.match(r"^- \[[ x]\] (T\d+)\.\s*(.*)$", l) for l in section_lines(text, "Test cases")) if m]
    if cases:
        out += ["", f"**Test case** ({len(cases)})"] + [f"- {k} · {short(v, 170)}" for k, v in cases[:6]]
    files = []
    for _, _, _, txt in steps:
        for f in re.findall(r"`([^`\s]+)`", txt):
            if ("/" in f or re.search(r"\.[A-Za-z0-9]{1,5}$", f)) and not f.startswith(("-", "http")) and f not in files:
                files.append(f)
    if files:
        out += ["", "**File sẽ động tới**", "- " + ", ".join(f"`{f}`" for f in files[:12]) + (f" … và {len(files) - 12} file nữa" if len(files) > 12 else "")]
    out += ["", f"**Verify:** {mode} · {VERIFY_MEANING.get(mode, mode)}"]
    if verdict == "OK":
        out.append("**Kiểm tra tự động:** ✅ không thấy dấu hiệu rủi ro")
    elif verdict.startswith("REVIEW"):
        out.append("**Kiểm tra tự động:** ⚠️ cần xem kỹ: " + verdict.split(": ", 1)[-1])
    elif verdict.startswith("CRITICAL"):
        out.append("**Kiểm tra tự động:** 🚨 rủi ro nghiêm trọng: " + verdict.split(": ", 1)[-1])
    elif verdict.startswith("BLOCK"):
        out.append("**Kiểm tra tự động:** ⛔ chặn plan này: " + verdict.split(": ", 1)[-1])
    if ask:
        out += ["", "Bấm **Duyệt** để giao OpenCode, **Sửa plan** để nhờ Tech Lead chỉnh, hoặc **Hủy**.",
                "Cũng có thể gõ `/approve`, `/revise <góp ý>` hoặc `/reject`."]
    return "\n".join(out)


def cmd_progress(slug, flush=False):
    """One report pass per task at a time: the background progress loop and the daemon both call this, and without the lock
    both could see "plan card not sent yet" and send it twice."""
    import fcntl
    os.makedirs(PROGRESS_DIR, exist_ok=True)
    with open(f"{PROGRESS_DIR}/{slug}.lock", "w") as lk:
        fcntl.flock(lk, fcntl.LOCK_EX)
        return _cmd_progress(slug, flush)


def _cmd_progress(slug, flush=False):
    lines = read_board()
    t = next((t for t in tasks(lines) if t["slug"] == slug), None)
    if not t:
        return 0
    stg = read_env().get("STAGING_BRANCH", "staging")
    text = plan_text(slug)
    steps = [(int(m.group(2)), m.group(1) == "x", m.group(3) or "", m.group(4)) for m in STEP_RE.finditer(text)]
    tests = dict(re.findall(r"^\s*- (T\d+): (PASS|FAIL|chưa viết)", "\n".join(section_lines(text, "Test status")), re.M))
    verify = (re.findall(r"^VERIFY:\s*(PASS|FAIL)", text, re.M) or [""])[-1]
    commits = task_commits(slug, stg)
    dev_commits = [(h, sub) for h, sub in commits if not sub.startswith("plan")]
    fix_commits = [(h, sub) for h, sub in commits if re.match(r"plan\(fix-\d+\)", sub)]
    shots = screenshots()

    os.makedirs(PROGRESS_DIR, exist_ok=True)
    sf = f"{PROGRESS_DIR}/{slug}.json"
    fresh = not os.path.exists(sf)
    st = {"plan": False, "steps": [], "tests": {}, "verify": "", "fix": [], "commits": [], "shots": [], "done": False,
          "t0": time.time()}
    if not fresh:
        with open(sf, encoding="utf8") as f:
            st.update(json.load(f))

    def save():
        with open(sf, "w", encoding="utf8") as f:
            json.dump(st, f, ensure_ascii=False)

    if fresh and t["state"] == "in_progress":
        # daemon restarted in the middle of a task: start from the current state instead of replaying history
        st.update(plan=True, steps=[n for n, d, _, _ in steps if d], tests=tests, verify=verify,
                  fix=[h for h, _ in fix_commits], commits=[h for h, _ in dev_commits],
                  shots=shots)
        save()
        return 0

    sent = 0
    total = len([1 for _ in steps])

    # A. The plan card. With PLAN_APPROVAL=ask (default) it carries buttons and the task waits for the user (state awaiting_plan);
    # a blocked plan, or PLAN_APPROVAL=auto, gets the same content without buttons and the daemon carries on by itself.
    if not st["plan"] and steps and t["state"] in ("plan_ready", "in_progress", "done", "shipped"):
        verdict = cmd_check_plan(slug) if t["state"] == "plan_ready" else "OK"
        approval = read_env().get("PLAN_APPROVAL", "auto")
        held = approval != "ask" and verdict.startswith("CRITICAL")
        gate = t["state"] == "plan_ready" and not verdict.startswith("BLOCK") and (approval == "ask" or held)
        card = plan_card_text(t, text, steps, verdict, gate, held)
        if gate:
            fresh = read_board()
            set_state(fresh, t["id"], "awaiting_plan")
            set_header(fresh, "Current Phase", "AWAITING_PLAN_APPROVAL")
            log_line(fresh, f"{t['id']}: plan " + ("có rủi ro nghiêm trọng, giữ lại chờ bạn duyệt." if held else "xong, chờ bạn duyệt."))
            write_board(fresh)
            emit("manager", card, requires="APPROVE_PLAN", task=t["id"])
        else:
            emit("techlead", card)
        st["plan"] = True
        sent += 1

    # B+C. Senior Dev: ONE report per finished step (description, commits, tests). Nothing is sent for a lone commit or a lone
    # test result: it waits for the step it belongs to (or for `flush`, when OpenCode is done), so messages never come in bursts.
    done_steps = [x for x in steps if x[1] and x[0] not in st["steps"]]
    new_commits = [c for c in dev_commits if c[0] not in st["commits"]]
    changed = [(k, v) for k, v in tests.items() if v in ("PASS", "FAIL") and st["tests"].get(k) != v]
    new_notes = [n for n in task_notes(text) if n not in st.get("notes", [])]   # notes ride along like commits and tests
    settled = flush or (time.time() - plan_mtime(slug) >= SETTLE_S)
    # Notes alone never make a message: with no step, commit or test to report they wait for the end-of-task report (F), which lists them all.
    if (done_steps and settled) or (flush and (new_commits or changed)):
        linked = push_task_branch(slug, st) if new_commits else False
        emit("dev", step_report(slug, total, done_steps, new_commits, changed, linked, new_notes, tid=t["id"]))
        st["steps"] += [x[0] for x in done_steps]
        st["commits"] += [c[0] for c in new_commits]
        st["tests"].update(dict(changed))
        st["notes"] = st.get("notes", []) + new_notes
        sent += 1

    # D. Tech Lead: Verify. A PASS is kept for the single end-of-task report (F); a FAIL is told right away because a fix cycle follows.
    if verify and verify != st["verify"]:
        new_shots = [f for f in shots if f not in st["shots"] and is_task_shot(t, f)]
        st["verify_notes"] = [short(l.lstrip("-* ").strip(), 110) for l in section_lines(text, "Verify")[:6] if not l.startswith("VERIFY:")]
        st["verify"] = verify
        st["shots"] = sorted(set(st["shots"]) | set(new_shots))
        st["task_shots"] = sorted(set(st.get("task_shots", [])) | set(new_shots))   # evidence of THIS task, used by the reports
        if verify == "FAIL":
            body = [f"🔎 **{t['id']} · Verify chưa qua** ❌ Mình thấy có chỗ chưa đúng, đang xem lại nha."]
            if st["verify_notes"]:
                body += ["", "**Ghi chú**"] + [f"- {n}" for n in st["verify_notes"]]
            if new_shots:
                body += ["", "Ảnh chụp màn hình ở dưới nè 📸"]
            emit("techlead", "\n".join(body), images=new_shots[-3:])
            st["shots_sent"] = sorted(set(st.get("shots_sent", [])) | set(new_shots[-3:]))
            sent += 1

    # E. Tech Lead: fix cycles
    for h, sub in fix_commits:
        if h not in st["fix"]:
            n_fix = (re.findall(r"plan\(fix-(\d+)\)", sub) or ["?"])[0]
            todo = []
            for _n, _done, _label, _txt in steps:
                if not _done and _txt.lstrip().lower().startswith("fix"):
                    todo.append("- " + short(re.sub(r"^Fix:\s*", "", _txt.lstrip(), flags=re.I), 100))
            todo = todo[:3]
            emit("techlead", f"Có chút trục trặc ở **{t['id']}** nên mình mở **vòng sửa {n_fix}** rồi giao lại OpenCode nha 🔁"
                 + ("\n\n**Sẽ sửa**\n" + "\n".join(todo) if todo else ""))
            st["fix"].append(h)
            sent += 1

    # F. Tech Lead: ONE report when the task is merged: Verify result and notes, the merge commit (linked) and the pictures, sent once.
    if t["state"] in ("done", "shipped") and not st["done"]:
        mode = (re.findall(r"^Verify mode:\s*(\w+)", text, re.M) or ["light"])[0]
        notes = st.get("verify_notes") or [short(l.lstrip("-* ").strip(), 110) for l in section_lines(text, "Verify")[:6] if not l.startswith("VERIFY:")]
        notes = [n for n in notes if n and not n.lower().startswith("bỏ qua")]
        res = st["verify"] or verify
        head = {"PASS": "✅ **PASS**", "FAIL": "❌ **FAIL**"}.get(res, f"bỏ qua (Verify mode: {mode})")
        rc, last = git("log", "-1", "--format=%h %s", stg)
        linked = push_branch(stg, st, "push_retry_stg") if rc == 0 else False
        base = repo_web_url()
        out = [f"🎉 **{t['id']}** xong rồi, đã merge vào nhánh `{stg}` nè!", "", "**Verify**", f"- Kết quả: {head}"] + [f"- {n}" for n in notes]
        if rc == 0:
            sha, _, sub = last.partition(" ")
            out += ["", "**Merge**", f"- [{sha}]({base}/commit/{sha}) {short(sub, 100)}" if linked and base else f"- `{sha}` {short(sub, 100)}"]
        all_notes = task_notes(text)
        if all_notes:
            out += ["", "**Lưu ý**"] + [f"- ⚠️ {short(n, 200)}" for n in all_notes[:6]]
        imgs = [f for f in task_screenshots(t, 4, recorded=st.get("task_shots", [])) if f not in st.get("shots_sent", [])]
        if imgs:
            out += ["", "📸 Ảnh mình chụp lúc verify ở dưới nè"]
        emit("techlead", "\n".join(out), images=imgs)
        st["shots_sent"] = sorted(set(st.get("shots_sent", [])) | set(imgs))
        st["reported_images"] = bool(imgs) or bool(st.get("shots_sent"))
        st["done"] = True
        sent += 1

    save()
    return sent


def usage_rows():
    rows = []
    try:
        with open(USAGE_LOG, encoding="utf8") as f:
            for line in f:
                try:
                    rows.append(json.loads(line))
                except ValueError:
                    pass
    except FileNotFoundError:
        pass
    return rows


def fmt_k(n):
    return f"{n / 1000:.1f}k" if n >= 1000 else str(n)


def opencode_usage(days):
    """Token/cost of OpenCode for this project from `opencode stats` (None if it cannot be read)."""
    try:
        p = subprocess.run(["opencode", "stats", "--days", str(days), "--models", "3", "--project", ""],
                           capture_output=True, text=True, timeout=25)
    except (OSError, subprocess.TimeoutExpired):
        return None
    txt = re.sub(r"\x1b\[[0-9;?]*[A-Za-z]", "", p.stdout + p.stderr)

    def val(label):
        m = re.search(rf"│\s*{label}\s+(\S+)\s*│", txt)
        return m.group(1) if m else None

    if not val("Sessions"):
        return None
    out = [f"⌨️ **OpenCode** · {'24 giờ qua' if days == 1 else f'{days} ngày qua'} (cả lần bạn chạy tay)",
           f"- {val('Sessions')} phiên · {val('Messages')} tin nhắn · ~{val('Total Cost')}",
           f"- token: vào {val('Input')} · cache đọc {val('Cache Read')} · ra {val('Output')}"]
    model = None
    for line in txt.split("\n"):
        m = re.match(r"^│ (\S+/\S+)\s*│$", line)
        if m:
            model = {"name": m.group(1).split("/", 1)[1], "msgs": "?", "cost": "?"}
            continue
        if model:
            mm = re.match(r"^│\s+Messages\s+(\S+)\s*│$", line)
            if mm:
                model["msgs"] = mm.group(1)
            mc = re.match(r"^│\s+Cost\s+(\S+)\s*│$", line)
            if mc:
                out.append(f"- model `{model['name']}`: {model['msgs']} tin · ~{mc.group(1)}")
                model = None
    return "\n".join(out)


def cmd_usage(days=1):
    days = max(1, min(days, 90))
    rows = usage_rows()
    since = datetime.fromtimestamp(time.time() - (days - 1) * 86400).strftime("%Y-%m-%d")
    rows = [r for r in rows if r.get("ts", "")[:10] >= since]
    label = "hôm nay" if days == 1 else f"{days} ngày qua"
    out = ["📊 **Mức dùng**", ""]

    def line(title, rs):
        return (f"- {title}: {len(rs)} lần gọi · {sum(r.get('turns', 0) for r in rs)} lượt · "
                f"vào {fmt_k(sum(r.get('input', 0) + r.get('cache_create', 0) for r in rs))} · "
                f"cache đọc {fmt_k(sum(r.get('cache_read', 0) for r in rs))} · "
                f"ra {fmt_k(sum(r.get('output', 0) for r in rs))} · ~${sum(r.get('cost_usd', 0) for r in rs):.2f}")

    if rows:
        out.append(f"🧠 **Claude** · {label}")
        out.append(line("tổng", rows))
        for role in ("manager", "techlead"):
            rs = [r for r in rows if r.get("role") == role]
            if rs:
                out.append(line(role, rs))
        out += ["", "**5 lần gọi gần nhất**"]
        for r in rows[-5:]:
            out.append(f"- {r.get('ts', '')[5:16]} · {r.get('role')} · {r.get('label')} · {r.get('turns')} lượt · "
                       f"~${r.get('cost_usd', 0):.2f}{'' if r.get('ok', True) else ' ❌ lỗi'}")
    else:
        out.append(f"🧠 **Claude** · {label}: chưa có lần gọi nào được ghi (usage.log) 🍃")
    oc = opencode_usage(days)
    out.append("")
    out.append(oc if oc else "⌨️ **OpenCode**: mình không đọc được `opencode stats` 😢 (opencode có trong PATH của daemon không?)")
    out += ["", "💡 Chi phí tính theo giá list API, chỉ để so sánh các bước với nhau; quota gói đăng ký tính khác. "
            "Gõ `/usage 7` để xem 7 ngày nha."]
    return "\n".join(out)


TOOLS_LOG_NAME = "tools.log"


def _tool_target(name, inp):
    """What a tool call touched, short enough for one log line."""
    inp = inp or {}
    if name in ("Grep", "Glob"):
        return " ".join(str(inp[k]) for k in ("pattern", "glob", "path") if inp.get(k))[:140]
    for k in ("file_path", "path", "notebook_path"):
        if inp.get(k):
            return str(inp[k])
    if name == "Bash":
        return str(inp.get("command", "")).replace("\n", " ⏎ ")[:140]
    return ""


def parse_claude_output(raw):
    """(result dict, tool calls) from `claude -p`: either one JSON object (output-format json) or the NDJSON event stream
    (stream-json: the tool_use blocks name every file the model opened). (None, []) when it is neither (plain text)."""
    try:
        d = json.loads(raw)
        if isinstance(d, dict):
            return d, []
    except ValueError:
        pass
    result, tools = None, []
    for line in raw.splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            ev = json.loads(line)
        except ValueError:
            continue
        if not isinstance(ev, dict):
            continue
        if ev.get("type") == "result":
            result = ev
        elif ev.get("type") == "assistant":
            for c in (ev.get("message") or {}).get("content") or []:
                if isinstance(c, dict) and c.get("type") == "tool_use":
                    tools.append((c.get("name", "?"), _tool_target(c.get("name"), c.get("input"))))
    return result, tools


def cmd_claude_result(role, label, model):
    raw = sys.stdin.read()
    d, tools = parse_claude_output(raw)
    if d is None:
        print(raw.strip())  # plain text (older CLI or a stub): pass through
        return 0
    u = d.get("usage") or {}
    ok = not d.get("is_error") and d.get("subtype", "success") == "success"
    os.makedirs(os.path.dirname(USAGE_LOG), exist_ok=True)
    with open(USAGE_LOG, "a", encoding="utf8") as f:
        f.write(json.dumps({
            "ts": datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "role": role, "label": label, "model": model or "default",
            "turns": d.get("num_turns", 0), "cost_usd": d.get("total_cost_usd", 0), "input": u.get("input_tokens", 0),
            "output": u.get("output_tokens", 0), "cache_read": u.get("cache_read_input_tokens", 0),
            "cache_create": u.get("cache_creation_input_tokens", 0), "ok": ok, "subtype": d.get("subtype"),
            "tools": dict(collections.Counter(n for n, _ in tools))},
            ensure_ascii=False) + "\n")
    if tools:   # one line per tool call: which files the model read, searched or ran, per call
        with open(os.path.join(os.path.dirname(USAGE_LOG), TOOLS_LOG_NAME), "a", encoding="utf8") as f:
            f.write(f"━━ {datetime.now():%F %T} {role} · {label}\n")
            for i, (n, tgt) in enumerate(tools, 1):
                f.write(f"{i:3}. {n:<6} {tgt}\n")
    text = (d.get("result") or "").strip()
    if not ok:
        print(f"[lỗi: {d.get('subtype')}] {text}".strip())
        return 4
    print(text)
    return 0


def cmd_inbox(path):
    with open(path, encoding="utf8") as f:
        d = json.load(f)
    cmd = d.get("command")
    args = (d.get("args") or "").strip()
    e = read_env()
    if cmd == "/status":
        write_board(read_board())   # refresh the settings block in case room.env was edited by hand
        reply = status_text()
    elif cmd == "/stop":
        reply = cmd_stop()
    elif cmd == "/resume":
        reply = cmd_resume(args)
    elif cmd == "/ship":
        reply = cmd_ship()
    elif cmd == "/usage":
        reply = cmd_usage(int(args.split()[0]) if args.split() and args.split()[0].isdigit() else 1)
    elif cmd == "/plan":
        if not args:
            reply = ("Bạn muốn hỏi gì về project nè? 🔍\nCách dùng: `/plan <câu hỏi>`. Mình và Tech Lead sẽ đọc code rồi tổng hợp gửi bạn, "
                     "không sửa gì và không tạo task nào hết.")
        else:
            return 5  # the daemon starts a read-only Q&A job (Tech Lead reads, Manager summarizes)
    elif cmd == "/automode":
        reply = cmd_automode(args)
    elif cmd == "/config":
        reply = cmd_config(args)
    elif cmd == "/approve":
        reply = cmd_plan_approve(args)
    elif cmd == "/reject":
        reply = cmd_plan_reject(args)
    elif cmd == "/revise":
        reply = cmd_plan_revise(args)
    elif cmd == "/clear":
        reply = cmd_clear()
    elif cmd == "/clearlog":
        reply = cmd_clearlog(args)
    elif cmd in ("/auto", "/task"):
        if e.get("AUTO_SPLIT") == "claude":
            return 3
        reply = cmd_auto(args)
    elif cmd is None:
        if e.get("CHAT_WITH_CLAUDE") == "true":
            return 3
        reply = HELP + "\n\n" + one_line_status()
    else:
        reply = HELP
    if reply:
        emit("manager", reply)
    print(cmd or "text")
    return 0


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 1
    c, a = argv[1], argv[2:]
    if c == "inbox":
        return cmd_inbox(a[0])
    if c == "task-id":   # task-id <slug|task file>: print the task id (T12) so shell callers can name the task in their messages
        key = re.sub(r"^\d{4}-\d{2}-\d{2}-", "", os.path.basename(a[0]).removesuffix(".md")) if a else ""
        print(next((t["id"] for t in tasks(read_board()) if t["slug"] == key), ""))
        return 0
    if c == "say":
        emit(a[0], a[1].replace("\\n", "\n"))  # shell callers write \n inside "..." strings
        return 0
    if c == "inbox-args":  # print the arguments of an inbox message (the question of /plan)
        with open(a[0], encoding="utf8") as f:
            print((json.load(f).get("args") or "").strip())
        return 0
    if c == "say-file":  # say-file <role> <file>: like say, but the text is taken verbatim from a file
        with open(a[1], encoding="utf8") as f:
            emit(a[0], f.read().strip())
        return 0
        return 0
    if c == "say-steps":  # say-steps <role> <head> <plan step line>...
        a[1] = a[1].replace("\\n", "\n")
        rows = []
        for line in a[2:]:
            m = STEP_RE.match(line)
            rows.append(f"{m.group(2)}. {short(m.group(4), 100)}" if m else short(line, 100))
        emit(a[0], a[1] + ("\n\n" + "\n".join(rows) if rows else ""))
        return 0
    if c == "claude-result":
        return cmd_claude_result(*a)
    if c == "usage":
        print(cmd_usage(int(a[0]) if a and a[0].isdigit() else 1))
        return 0
    simple = {"status": status_text, "stop": cmd_stop, "finalize": cmd_finalize}
    if c == "resume":
        print(cmd_resume(" ".join(a)))
        return 0
    if c in simple:
        print(simple[c]())
        return 0
    if c == "progress":
        try:
            print(cmd_progress(a[0], "--flush" in a[1:]))
        except Exception as e:   # the reports must not stop silently: tell the user once, then fail loudly into ops.log
            notify_once("progress-error", "Mình đang gặp lỗi khi tạo báo cáo tiến độ nên có thể sẽ **thiếu vài tin báo** ⚠️\n"
                        f"Task vẫn chạy bình thường. Lỗi: `{type(e).__name__}`, chi tiết trong `.agents/logs/ops.log`.")
            raise
        return 0
    if c == "review-note":
        print(cmd_review_note(a[0], " ".join(a[1:])))
        return 0
    if c == "plan-path":
        print(plan_path(a[0]))
        return 0
    if c == "check-plan":
        print(cmd_check_plan(a[0]))
        return 0
    if c == "skipped-notice":
        cmd_skipped_notice()
        return 0
    if c == "approve":
        r = cmd_approve(a[0], by_user=len(a) > 1 and a[1] == "user")
        print(r)
        return 0 if r.startswith("✅") else 1
    if c == "block":
        print(cmd_block(a[0], " ".join(a[1:])))
        return 0
    print(__doc__)
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
