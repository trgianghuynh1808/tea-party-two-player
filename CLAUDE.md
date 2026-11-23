@AGENTS.md

## Handoff to OpenCode (Claude only)

Claude plans, verifies, reviews and ships; OpenCode implements. Do not implement a task plan yourself unless the user explicitly asks.

### Planning

When the user approves a plan:

1. Write the plan to `.agents/tasks/<YYYY-MM-DD>-<slug>.md` using `.agents/tasks/_TEMPLATE.md`.
   - Every plan step must look like `- [ ] N. [dễ|vừa|khó] ...`, start with its main file path in backticks, and name the exact files and functions to change.
   - Label honestly: `[dễ]` = one file, mechanical change; `[vừa]` = a few files following existing patterns; `[khó]` = new design, cross client/server/shared, or tricky sync logic.
   - Any step that changes `shared/` or touches both `client/` and `server/` is at least `[khó]`. Keep a `[vừa]` step inside one side only. The runner picks the `[vừa]` model from the step's first path: `client/` → GLM-5.3, `server/` → DeepSeek.
   - Prefer 3–6 steps; merge tiny related changes into one step. Consecutive steps with the same label run in one OpenCode session, so keep same-label steps together when it makes sense.
   - Add a "## Ngữ cảnh" section before "## Plan": the key file paths, function signatures, types and constants the steps depend on (short snippets, not whole files), so OpenCode does not have to re-explore the codebase.
   - The plan must include a "Test cases" section: each e2e test as `- [ ] T1. <name> — <what it verifies> — tests/<file>.spec.ts`.
   - Keep tests lean: at most 3 test cases per task, each tied to one goal. Prefer extending an existing spec file and reusing `tests/helpers.ts` over new files. Do not test what the type checker already guarantees.
   - The plan must include the step(s) that write those specs. If a test needs game state that is hard to reach, plan to set it via `window.__GAME__` (add what the hook is missing as its own step).
   - Every step that runs tests must name the exact command, e.g. `npx playwright test tests/orders-panel.spec.ts -g "T1"`, so the executor does not run or design anything else.
   - Set the `Verify mode:` line at the top of the task file: `none` for refactors, copy/text or config changes with no user-visible behavior; `light` (default) for normal UI/feature changes; `full` only for new player flows, 2-player/sync logic, or risky changes.
2. Create a task branch from the main branch: `git checkout main && git pull --ff-only && git checkout -b task/<slug>`. If the working tree is dirty, stop and ask the user.
3. Commit only the task file on that branch: `git add <task file> && git commit -m "plan: <slug>"`.
4. Hand off: `scripts/handoff.sh <task file>`. Remember this path: Autopilot passes it to `scripts/wait-task.sh`.
5. Unless the user said "manual", continue with **Autopilot** below without waiting for the user.

### Autopilot

After every hand-off, run the loop below on your own. Run long commands with the maximum Bash timeout (600000 ms).

1. **Wait:** run `scripts/wait-task.sh <task file>`, where `<task file>` is the exact path you just passed to `scripts/handoff.sh` (e.g. `scripts/wait-task.sh .agents/tasks/2026-01-31-my-slug.md`). Never run it without that argument; if you lost the path, use the newest plan: `ls -t .agents/tasks/*.md | grep -v _TEMPLATE | head -1`.
   - exit 3 (still running): run the same command again with the same path. Do not do anything else meanwhile.
   - exit 1 (error, e.g. the watcher is not running): stop and tell the user.
   - exit 0 (done): go to step 2.
   - exit 2 (stuck): go to step 5.
2. **Verify** at the depth of the task file's `Verify mode:` line (`light` if missing; skip for `none`; also skip if the task file already ends its Verify section with `VERIFY: PASS` from OpenCode):
   - Run the whole e2e suite once and record each test case (T1, T2...) in "Test status".
   - `light`: open the app with `playwright-cli` only for test cases a spec cannot check (visual/layout), one screenshot each; do not invent new scenarios; write a spec only to reproduce a bug you found.
   - `full`: also try up to 2 important edge scenarios and add specs for unchecked ones (max 3 new tests).
   - Open the game at `http://localhost:5173/?test=1` and use `window.__GAME__` to reach state; for room/sync features open 2 sessions and put both players in the same room.
   - Write the "## Verify" section (each item, PASS/FAIL, screenshot paths), ending with exactly `VERIFY: PASS` or `VERIFY: FAIL`. Do not change app code here. Close the browser and commit the task file and any new specs.
3. **Review:** read the task file and `git diff main...HEAD`. Classify findings as **blocking** (bugs, behavior that differs from the goals, failing or missing test cases, security/data issues, docs left out of date per "Documentation Rules" in AGENTS.md) or **non-blocking** (style, naming, small cleanups).
4. **Decide:**
   - `VERIFY: PASS` (or Verify mode `none`), `npm run typecheck` passes, and no blocking findings → **Ship** (below), then notify: `scripts/notify.sh "Shipped ✅" "<slug> → <commit hash>"`, report a short summary to the user, and stop.
   - Otherwise → step 5.
5. **Fix cycle** (also used when OpenCode is stuck):
   - Count previous fix cycles: `git log --oneline main..HEAD --grep "plan(fix-"`. If there are already 2, stop: `scripts/notify.sh "Cần bạn ⛔" "<slug>: đã sửa 2 vòng vẫn chưa đạt"`, summarize what is still wrong and wait for the user.
   - Diagnose from the task file ("Trạng thái hiện tại", "Test status", "Verify", "Đã thử mà không được"), `test-results/results.json` and the tail of `.agents/run.log`.
   - Append new unchecked steps to the same task file's Plan, continuing the numbering, each prefixed `Fix:` and following the same rules (path first, label, exact test command). For a stuck step: mark it `- [x] N. ~~...~~ (thay bằng bước M–K)` and replace it with smaller, more explicit steps (include the code snippet or exact change when helpful), labeled one level higher if the cheaper model already failed.
   - Clear the old `VERIFY:` line so the next Verify starts fresh, then commit: `git add <task file> && git commit -m "plan(fix-<n>): <slug>"`.
   - Hand off again with `scripts/handoff.sh <task file>` and go back to step 1 (wait with the same task file path).

The user can interrupt at any time; if they do, follow their instructions instead of the loop.

### Verify / review on request (manual mode)

When the user says "verify": run Autopilot steps 2–4 once (verify, review, decide), but ask before shipping.


When the user asks for a review: read the task file (including "Test status" and "Verify") and `git diff main...HEAD`; report bugs, deviations from the plan and failed or missing test cases; do not rewrite correct code; propose fixes as a follow-up plan unless asked to fix directly; end with one line saying whether it is ready to ship.

### Ship

When shipping (from Autopilot, or when the user says "ship"):

1. Make sure the working tree is clean and `npm run typecheck` passes.
   Double-check `README.md` (and `AGENTS.md` if relevant) against the code, per "Documentation Rules" in AGENTS.md. If it is out of date, update it (in the same task, or as a separate `docs:` commit before shipping) — do not ship with stale docs.
2. Squash the branch into one commit on main:
   `git checkout main && git pull --ff-only && git merge --squash task/<slug>`
3. Commit with one Conventional Commit message summarizing the whole task (e.g. `feat(orders): show container line last in recipe`), with a short body listing the main changes and the test cases added. Do not mention the individual step commits or fix cycles.
   - If the branch also touches files outside the task plan (e.g. `scripts/`, tooling, `CLAUDE.md`), unstage them (`git reset -q <paths>`) before this commit and commit them separately afterwards (`chore: ...`), so the feature commit stays clean.
4. `git push origin main`, then delete the task branch: `git branch -D task/<slug>`.
5. Report the final commit hash. If the pull or push fails (e.g. remote has new commits, conflicts), stop and tell the user instead of forcing.
