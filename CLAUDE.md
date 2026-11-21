@AGENTS.md

## Handoff to OpenCode (Claude only)

Claude plans and reviews; OpenCode implements and verifies. Do not implement a task plan yourself unless the user explicitly asks.

When the user approves a plan:

1. Write the plan to `.agents/tasks/<YYYY-MM-DD>-<slug>.md` using `.agents/tasks/_TEMPLATE.md`.
   - Every plan step must look like `- [ ] N. [dễ|vừa|khó] ...` and name the exact files and functions to change.
   - Label honestly: `[dễ]` = one file, mechanical change; `[vừa]` = a few files following existing patterns; `[khó]` = new design, cross client/server/shared, or tricky sync logic.
   - Any step that changes `shared/` or touches both `client/` and `server/` is at least `[khó]`. Keep a `[vừa]` step inside one side only.
   - Start every step with its main file path in backticks (e.g. `` `server/src/rooms/BobaShopRoom.ts` → onInteract: ... ``). The runner picks the `[vừa]` model from that path: `client/` → GLM-5.3, `server/` → DeepSeek.
   - Prefer 3–6 steps; merge tiny related changes into one step. Consecutive steps with the same label run in one OpenCode session, so keep same-label steps together when it makes sense.
   - Add a "## Ngữ cảnh" section before "## Plan": the key file paths, function signatures, types and constants the steps depend on (short snippets, not whole files), so OpenCode does not have to re-explore the codebase.
   - The plan must include a "Test cases" section: each e2e test as `- [ ] T1. <name> — <what it verifies> — tests/<file>.spec.ts`.
   - Keep tests lean: at most 3 test cases per task, each tied to one goal. Prefer extending an existing spec file and reusing `tests/helpers.ts` over new files. Do not test what the type checker already guarantees.
   - The plan must include the step(s) that write those specs. If a test needs game state that is hard to reach, plan to set it via `window.__GAME__` (add what the hook is missing as its own step).
   - Every step that runs tests must name the exact command, e.g. `npx playwright test tests/orders-panel.spec.ts -g "T1"`, so the executor does not run or design anything else.
   - Set the `Verify mode:` line at the top of the task file: `none` for refactors, copy/text or config changes with no user-visible behavior; `light` (default) for normal UI/feature changes; `full` only for new player flows, 2-player/sync logic, or risky changes.
2. Create a task branch from the current main branch: `git checkout main && git pull --ff-only && git checkout -b task/<slug>`. If the working tree is dirty, stop and ask the user.
3. Commit only the task file on that branch: `git add <task file> && git commit -m "plan: <slug>"`. The working tree must be clean afterwards (OpenCode refuses to start otherwise).
4. Hand off: `echo <task file> > .agents/queue/$(date +%s).job`
5. Tell the user in one line that OpenCode has started on branch `task/<slug>`, then stop.

When the user says "verify" after OpenCode finishes the code steps (used when `DEFAULT_VERIFY_AGENT="claude"` in `.agents/config.sh`):

1. Read the task file. The depth comes from its `Verify mode:` line (`light` if missing; `none` means skip straight to review).
2. Run the whole e2e suite once and record each test case (T1, T2...) in "Test status".
3. `light`: open the app with `playwright-cli` only for test cases a spec cannot check (visual/layout), one screenshot each; do not invent new scenarios; write a spec only to reproduce a bug you found.
   `full`: also try up to 2 important edge scenarios and add specs for unchecked ones (max 3 new tests).
   Use `window.__GAME__` (open the game at `http://localhost:5173/?test=1`) to reach state; for room/sync features open 2 sessions and put both players in the same room.
4. Write the "## Verify" section (each item, PASS/FAIL, screenshot paths), ending with exactly `VERIFY: PASS` or `VERIFY: FAIL`. Do not change app code. Close the browser and commit the task file and any new specs.
5. Continue directly with the review below (same session, no need for the user to ask again).

When the user asks for a review after OpenCode finishes:

1. Read the task file, including "Test status" and "Verify".
2. Read `git diff main...HEAD` on the task branch.
3. Report bugs, deviations from the plan, and failed or missing test cases. Do not rewrite code that is correct.
4. If Verify found failures, propose the fix as a short follow-up plan instead of fixing it directly, unless the user asks you to fix it.
5. End the review with one line: whether it is ready to ship.

When the user says "ship" (or asks to merge/push) on a task branch:

1. Make sure the working tree is clean and `npm run typecheck` passes.
2. Squash the branch into one commit on main:
   `git checkout main && git pull --ff-only && git merge --squash task/<slug>`
3. Commit with one Conventional Commit message summarizing the whole task (e.g. `feat(orders): show container line last in recipe`), with a short body listing the main changes and the test cases added. Do not mention the individual step commits.
   - If the branch also touches files outside the task plan (e.g. `scripts/`, tooling, `CLAUDE.md`), unstage them (`git reset -q <paths>`) before this commit and commit them separately afterwards (`chore: ...`), so the feature commit stays clean.
4. `git push origin main`, then delete the task branch: `git branch -D task/<slug>`.
5. Report the final commit hash and that it was pushed. If the push fails (e.g. remote has new commits), stop and tell the user instead of forcing.
