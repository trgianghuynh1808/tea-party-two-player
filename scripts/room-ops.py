#!/usr/bin/env python3
"""Deterministic room operations (no AI). Run from the project root.

Used by scripts/manager-loop.sh so the Manager only needs Claude for judgement calls.

  room-ops.py inbox <file>          handle one inbox message (exit 0 handled, 3 = needs Claude, other = error)
  room-ops.py say <role> <text>     write a message to .agents/outbox
  room-ops.py status | stop | resume | usage
  room-ops.py plan-path <slug>      path of the newest plan file for a task slug
  room-ops.py check-plan <slug>     prints OK | BLOCK: <why> | REVIEW: <why>
  room-ops.py approve <slug>        mark plan APPROVED_BY_MANAGER, commit, hand off to OpenCode
  room-ops.py block <id> <reason>   mark task BLOCKED, turn AUTO_MODE off, tell the user
  room-ops.py finalize              build the ship report (outbox, APPROVE_SHIP), phase AWAITING_SHIP_APPROVAL
  room-ops.py progress <slug>       report new progress (plan, steps, tests, verify, fix, merge) read from the task file and git
  room-ops.py claude-result <role> <label> <model>   stdin: `claude -p --output-format json`; prints text, logs usage
"""
import glob
import json
import os
import re
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

HELP = ("Mình nhận các lệnh: /auto <checklist>, /status, /health, /usage, /stop, /resume, /ship. "
        "Gõ / để xem menu. Tin thường không được xử lý để tiết kiệm quota.")


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


def write_board(lines):
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
            mark = "x" if state in ("done", "shipped") else " "
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
        "shipped": "🚀", "BLOCKED": "⛔"}


def status_text():
    lines = read_board()
    ts = tasks(lines)
    e = read_env()
    finished = [t for t in ts if t["state"] in ("done", "shipped")]
    out = [f"Phase {get_phase(lines)} · AUTO_MODE {'ON' if e.get('AUTO_MODE') == 'true' else 'OFF'} · "
           f"{len(finished)}/{len(ts)} task xong"]
    for t in ts:
        out.append(f"{ICON.get(t['state'], '•')} {t['id']} [{t['state']}] {t['title']}")
    if not ts:
        out.append("Board trống. Gõ /auto <checklist> để bắt đầu.")
    return "\n".join(out)


def cmd_stop():
    lines = read_board()
    set_auto(lines, False, "IDLE")
    log_line(lines, "/stop: AUTO_MODE tắt, phase IDLE.")
    write_board(lines)
    return "⏹ Đã tắt AUTO_MODE (phase IDLE). Task đang chạy dở sẽ không được tiếp tục cho tới khi /resume."


def cmd_resume():
    lines = read_board()
    e = read_env()
    if e.get("AUTO_MODE") == "true":
        return "AUTO_MODE đang bật rồi."
    ts = [t for t in tasks(lines) if not t["done"]]
    if not ts:
        return "Không có task nào chưa xong để chạy tiếp."
    for t in ts:
        if t["state"] == "BLOCKED":
            set_state(lines, t["id"], "pending")
    set_auto(lines, True, "RUNNING")
    log_line(lines, "/resume: AUTO_MODE bật, task BLOCKED chuyển lại pending.")
    write_board(lines)
    try:
        os.remove(f"{AG}/manager.sig")
    except FileNotFoundError:
        pass
    return f"▶ Chạy tiếp: còn {len(ts)} task chưa xong."


def clean_item(line):
    line = line.strip()
    line = re.sub(r"^(?:[-*•]\s*)?(?:\[[ xX]\]\s*)?", "", line)
    line = re.sub(r"^\d+[.)]\s+", "", line)
    return line.strip()


def cmd_auto(args):
    items = [clean_item(l) for l in args.splitlines()]
    items = [i for i in items if i]
    if not items:
        return "Cách dùng: /auto <checklist>, mỗi dòng một task."
    e = read_env()
    main, stg = e.get("MAIN_BRANCH", "main"), e.get("STAGING_BRANCH", "staging")
    rc, _ = git("show-ref", "--verify", "--quiet", f"refs/heads/{stg}")
    if rc != 0:
        rc, out = git("branch", stg, main)
        if rc != 0:
            return f"⛔ Không tạo được nhánh {stg} từ {main}: {out}"
    lines = read_board()
    nums = [int(t["id"][1:]) for t in tasks(lines)]
    n = max(nums) + 1 if nums else 1
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
    set_auto(lines, True, "RUNNING")
    log_line(lines, f"/auto: thêm {len(new)} task, AUTO_MODE bật.")
    write_board(lines)
    return "🚀 Đã nhận " + str(len(new)) + " task:\n" + "\n".join(f"{i + 1}. {t}" for i, t in enumerate(items)) + \
        "\nAUTO_MODE bật, Tech Lead sẽ lên plan."


def cmd_ship():
    lines = read_board()
    phase = get_phase(lines)
    if phase != "AWAITING_SHIP_APPROVAL":
        return f"Chưa có gì chờ duyệt ship (phase {phase})."
    e = read_env()
    main, stg = e.get("MAIN_BRANCH", "main"), e.get("STAGING_BRANCH", "staging")
    rc, out = git("status", "--porcelain")
    if out:
        return "⛔ Chưa ship: cây git còn file chưa commit:\n" + "\n".join(out.splitlines()[:8])
    has_remote = bool(git("remote")[1])
    rc, out = git("checkout", main)
    if rc != 0:
        return f"⛔ Không checkout được {main}: {out}"
    try:
        if has_remote:
            rc, out = git("pull", "--ff-only")
            if rc != 0:
                return f"⛔ Chưa ship: git pull --ff-only lỗi: {out[:400]}"
        n = len([t for t in tasks(lines) if t["state"] == "done"])
        rc, out = git("merge", "--no-ff", stg, "-m", f"Merge {stg} into {main} ({n} task)")
        if rc != 0:
            git("merge", "--abort")
            return f"⛔ Merge lỗi (đã huỷ merge, không đổi gì): {out[:400]}"
        sha = git("rev-parse", "--short", "HEAD")[1]
        msg = f"🚀 Đã merge {stg} vào {main} ({sha})."
        if has_remote:
            rc, out = git("push", "origin", main)
            msg += " Đã push." if rc == 0 else f"\n⚠️ Merge xong nhưng push lỗi: {out[:300]}"
        lines = read_board()
        for t in tasks(lines):
            if t["state"] == "done":
                set_state(lines, t["id"], "shipped")
        set_header(lines, "Current Phase", "SHIPPED")
        log_line(lines, f"/ship: merge {stg} vào {main} ({sha}).")
        write_board(lines)
        return msg
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
    review = []
    if len(steps) > 8:
        review.append(f"plan có {len(steps)} bước (>8)")
    if any(not re.match(r"^- \[[ x]\] \d+\. \[(dễ|vừa|khó)\]", s) for s in steps):
        review.append("có bước thiếu nhãn độ khó")
    if re.search(r"secret|credential|private[_ ]key|api[_ -]?key|\.pem\b", text, re.I):
        review.append("nhắc tới secret/credential/key")
    if re.search(r"migrat", text, re.I):
        review.append("có migration")
    if re.search(r"\.github/workflows|Dockerfile|docker-compose|\bdeploy", text, re.I):
        review.append("đụng cấu hình CI/deploy")
    if re.search(r"package-lock\.json|pnpm-lock\.yaml|yarn\.lock", text):
        review.append("đụng lockfile")
    if re.search(r"rm\s+-rf", text):
        review.append("có rm -rf")
    none_mode = re.search(r"^Verify mode:\s*none", text, re.M | re.I)
    if not none_mode and not re.search(r"\b(npm|npx|pnpm|yarn|pytest|vitest|jest|playwright|go test|cargo test|make test)\b", text):
        review.append("không thấy lệnh test cụ thể")
    return "REVIEW: " + "; ".join(review) if review else "OK"


def cmd_approve(slug):
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
    if p and "APPROVED_BY_MANAGER" not in open(p, encoding="utf8").read():
        body = open(p, encoding="utf8").read().split("\n")
        body[1:1] = ["", "APPROVED_BY_MANAGER"]
        open(p, "w", encoding="utf8").write("\n".join(body))
        git("add", p)
        rc, out = git("commit", "-m", f"plan: approved {slug}")
        if rc != 0:
            return cmd_block(t["id"], f"commit duyệt plan lỗi: {out[:200]}")
    pr = subprocess.run(["scripts/handoff.sh", p], capture_output=True, text=True)
    if pr.returncode != 0:
        return cmd_block(t["id"], "hand-off lỗi: " + (pr.stdout + pr.stderr).strip()[-300:])
    lines = read_board()
    set_state(lines, t["id"], "in_progress")
    log_line(lines, f"{t['id']}: plan duyệt tự động (APPROVED_BY_MANAGER), đã giao OpenCode.")
    write_board(lines)
    return f"✅ {t['id']}: plan đã duyệt, giao cho OpenCode."


def cmd_block(task_id, reason):
    lines = read_board()
    set_state(lines, task_id, "BLOCKED")
    set_auto(lines, False, "BLOCKED")
    log_line(lines, f"{task_id}: BLOCKED — {reason}")
    write_board(lines)
    msg = f"⛔ {task_id} bị chặn: {reason}\nĐã tắt AUTO_MODE. Xem plan/log rồi /resume hoặc /stop."
    emit("manager", msg)
    return msg


def cmd_finalize():
    lines = read_board()
    e = read_env()
    main, stg = e.get("MAIN_BRANCH", "main"), e.get("STAGING_BRANCH", "staging")
    done = [t for t in tasks(lines) if t["state"] == "done"]
    out = ["✅ Tất cả task đã xong, chờ duyệt ship.", "", "Task hoàn thành:"]
    for t in done:
        v = ""
        for f in glob.glob(f"{AG}/tasks/*{t['slug']}*.md"):
            m = re.findall(r"^VERIFY:\s*(PASS|FAIL)", open(f, encoding="utf8").read(), re.M)
            if m:
                v = f" (Verify {m[-1]})"
        out.append(f"- {t['id']}: {t['title']}{v}")
    rc, log = git("log", "--oneline", f"{main}..{stg}")
    if rc == 0 and log:
        out += ["", f"Commit trên {stg} chưa có trong {main}:"] + [f"- {l}" for l in log.splitlines()[:15]]
    shots = sorted(glob.glob(f"{AG}/screenshots/**/*.png", recursive=True), key=os.path.getmtime)[-6:]
    out += ["", "Bấm Ship hoặc gõ /ship để duyệt, /stop để giữ lại."]
    set_auto(lines, False, "AWAITING_SHIP_APPROVAL")
    log_line(lines, "FINALIZE: tất cả task done, chờ /ship.")
    write_board(lines)
    emit("manager", "\n".join(out), images=shots, requires="APPROVE_SHIP")
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
    return s if len(s) <= n else s[: n - 1] + "…"


def task_commits(slug, stg):
    rc, out = git("log", "--reverse", "--format=%h\t%s", f"{stg}..task/{slug}")
    if rc != 0:
        return []
    return [tuple(l.split("\t", 1)) for l in out.splitlines() if "\t" in l]


def screenshots():
    files = []
    for ext in IMG_EXT:
        files += glob.glob(f"{AG}/screenshots/**/{ext}", recursive=True)
    return sorted(set(files), key=os.path.getmtime)


def cmd_progress(slug):
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

    # A. plan summary (Tech Lead)
    if not st["plan"] and steps and t["state"] in ("plan_ready", "in_progress", "done", "shipped"):
        mode = (re.findall(r"^Verify mode:\s*(\w+)", text, re.M) or ["light"])[0]
        n_tests = len(re.findall(r"^- \[[ x]\] T\d+\.", text, re.M))
        body = [f"📋 Plan {t['id']} sẵn sàng · {total} bước · {n_tests} test · Verify {mode}"]
        for n, _, label, txt in steps[:6]:
            body.append(f"{n}. {('[' + label + '] ') if label else ''}{short(txt, 90)}")
        if total > 6:
            body.append(f"… và {total - 6} bước nữa")
        emit("techlead", "\n".join(body))
        st["plan"] = True
        sent += 1

    # B. Senior Dev: steps finished + commits
    new_steps = [x for x in steps if x[1] and x[0] not in st["steps"]]
    new_commits = [c for c in dev_commits if c[0] not in st["commits"]]
    if new_steps or new_commits:
        body = []
        for n, _, label, txt in new_steps:
            body.append(f"✅ Bước {n}/{total}{(' [' + label + ']') if label else ''}: {short(txt, 90)}")
        for h, sub in new_commits[:3]:
            body.append(f"• commit {h} {short(sub, 80)}")
        if len(new_commits) > 3:
            body.append(f"• … +{len(new_commits) - 3} commit")
        emit("dev", "\n".join(body))
        st["steps"] += [x[0] for x in new_steps]
        st["commits"] += [c[0] for c in new_commits]
        sent += 1

    # C. Senior Dev: test results
    changed = [(k, v) for k, v in tests.items() if v in ("PASS", "FAIL") and st["tests"].get(k) != v]
    if changed:
        emit("dev", "🧪 Test: " + " · ".join(f"{k} {v}" for k, v in changed))
        st["tests"].update(dict(changed))
        sent += 1

    # D. Tech Lead: Verify result + new screenshots
    if verify and verify != st["verify"]:
        new_shots = [f for f in shots if f not in st["shots"] and os.path.getmtime(f) >= st["t0"] - 5]
        body = [f"🔎 Verify {verify}"] + [short(l, 110) for l in section_lines(text, "Verify")[:6] if not l.startswith("VERIFY:")]
        emit("techlead", "\n".join(body), images=new_shots[-3:])
        st["verify"] = verify
        st["shots"] = sorted(set(st["shots"]) | set(new_shots))
        sent += 1

    # E. Tech Lead: fix cycles
    for h, sub in fix_commits:
        if h not in st["fix"]:
            emit("techlead", f"🔁 {short(sub, 110)} — Tech Lead thêm bước Fix và giao lại OpenCode")
            st["fix"].append(h)
            sent += 1

    # F. Tech Lead: merged into staging
    if t["state"] in ("done", "shipped") and not st["done"]:
        rc, last = git("log", "-1", "--format=%h %s", stg)
        emit("techlead", f"🎉 {t['id']} đã merge vào {stg}" + (f": {short(last, 100)}" if rc == 0 else ""))
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


def cmd_usage():
    rows = usage_rows()
    if not rows:
        return "Chưa có số liệu (usage.log trống)."
    today = datetime.now().strftime("%Y-%m-%d")
    out = []

    def block(title, rs):
        if not rs:
            return
        out.append(f"{title}: {len(rs)} lần gọi, {sum(r.get('turns', 0) for r in rs)} lượt, "
                   f"in {fmt_k(sum(r.get('input', 0) + r.get('cache_create', 0) for r in rs))} · "
                   f"cache đọc {fmt_k(sum(r.get('cache_read', 0) for r in rs))} · "
                   f"out {fmt_k(sum(r.get('output', 0) for r in rs))} · ~${sum(r.get('cost_usd', 0) for r in rs):.2f}")

    block("Hôm nay", [r for r in rows if r.get("ts", "").startswith(today)])
    for role in ("manager", "techlead"):
        block(f"  {role}", [r for r in rows if r.get("role") == role and r.get("ts", "").startswith(today)])
    out.append("")
    out.append("5 lần gọi gần nhất:")
    for r in rows[-5:]:
        out.append(f"- {r.get('ts', '')[11:16]} {r.get('role')} {r.get('label')}: {r.get('turns')} lượt, "
                   f"~${r.get('cost_usd', 0):.2f}{'' if r.get('ok', True) else ' (LỖI)'}")
    out.append("")
    out.append("(Chi phí quy theo giá list API, chỉ để so sánh giữa các bước; quota gói đăng ký tính khác.)")
    return "\n".join(out)


def cmd_claude_result(role, label, model):
    raw = sys.stdin.read()
    try:
        d = json.loads(raw)
        assert isinstance(d, dict)
    except (ValueError, AssertionError):
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
            "cache_create": u.get("cache_creation_input_tokens", 0), "ok": ok, "subtype": d.get("subtype")},
            ensure_ascii=False) + "\n")
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
        reply = status_text()
    elif cmd == "/stop":
        reply = cmd_stop()
    elif cmd == "/resume":
        reply = cmd_resume()
    elif cmd == "/ship":
        reply = cmd_ship()
    elif cmd == "/usage":
        reply = cmd_usage()
    elif cmd == "/auto":
        if e.get("AUTO_SPLIT") == "claude":
            return 3
        reply = cmd_auto(args)
    elif cmd is None:
        if e.get("CHAT_WITH_CLAUDE") == "true":
            return 3
        reply = HELP + "\n" + status_text().split("\n")[0]
    else:
        reply = HELP
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
    if c == "say":
        emit(a[0], a[1])
        return 0
    if c == "claude-result":
        return cmd_claude_result(*a)
    simple = {"status": status_text, "stop": cmd_stop, "resume": cmd_resume, "usage": cmd_usage,
              "finalize": cmd_finalize}
    if c in simple:
        print(simple[c]())
        return 0
    if c == "progress":
        print(cmd_progress(a[0]))
        return 0
    if c == "plan-path":
        print(plan_path(a[0]))
        return 0
    if c == "check-plan":
        print(cmd_check_plan(a[0]))
        return 0
    if c == "approve":
        r = cmd_approve(a[0])
        print(r)
        return 0 if r.startswith("✅") else 1
    if c == "block":
        print(cmd_block(a[0], " ".join(a[1:])))
        return 0
    print(__doc__)
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
