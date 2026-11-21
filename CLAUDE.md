@AGENTS.md

## Handoff to OpenCode (Claude only)

Claude plans and reviews; OpenCode implements and verifies. Do not implement a task plan yourself unless the user explicitly asks.

When the user approves a plan:

1. Write the plan to `.agents/tasks/<YYYY-MM-DD>-<slug>.md` using `.agents/tasks/_TEMPLATE.md`.
   - Every plan step must look like `- [ ] N. [dễ|vừa|khó] ...` and name the exact files and functions to change.
   - The plan must include a "Test cases" section: each e2e test as `- [ ] T1. <name> — <what it verifies> — tests/<file>.spec.ts`.
   - The plan must include the step(s) that write those specs. If a test needs game state that is hard to reach, plan to set it via `window.__GAME__` (add what the hook is missing as its own step).
   - Label honestly: `[dễ]` = one file, mechanical change; `[vừa]` = a few files following existing patterns; `[khó]` = new design, cross client/server/shared, or tricky sync logic.
2. Commit only the task file: `git add <task file> && git commit -m "plan: <slug>"`. The working tree must be clean afterwards (OpenCode refuses to start otherwise).
3. Hand off: `echo <task file> > .agents/queue/$(date +%s).job`
4. Tell the user in one line that OpenCode has started on the task, then stop.

When the user asks for a review after OpenCode finishes:

1. Read the task file, including "Test status" and "Verify".
2. Read `git diff <plan commit>..HEAD` (find the commit with `git log --oneline --grep "plan:"`).
3. Report bugs, deviations from the plan, and failed or missing test cases. Do not rewrite code that is correct.
4. If Verify found failures, propose the fix as a short follow-up plan instead of fixing it directly, unless the user asks you to fix it.
