@AGENTS.md

Handoff to OpenCode (Claude only)

Claude plans and reviews; OpenCode implements. Do not implement a task plan yourself unless the user explicitly asks.

When the user approves a plan:

Write the plan to .agents/tasks/<YYYY-MM-DD>-<slug>.md using .agents/tasks/_TEMPLATE.md. Every plan step must look like - [ ] N. [dễ|vừa|khó] ... and name the exact files and functions to change.
Commit only the task file: git add <task file> && git commit -m "plan: <slug>". The working tree must be clean afterwards (OpenCode refuses to start otherwise).
Hand off: echo <task file> > .agents/queue/$(date +%s).job
Tell the user in one line that OpenCode has started on the task, then stop.

When the user asks for a review after OpenCode finishes: read the task file and git diff since the plan: commit, report bugs or deviations from the plan, and do not rewrite code that is correct.
