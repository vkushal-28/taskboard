---
name: start
description: Resume work on Taskboard at the start of a session. Reads the progress log, recent commits and branch state, then reports where we are and what is next.
disable-model-invocation: true
---

Resume the Taskboard project.

1. Read docs/PROGRESS.md, especially "Next session starts here".
2. Run `git status`, `git branch --show-current` and `git log --oneline -10`.
3. Open the current phase in docs/PLAN.md and find the next unfinished slice.
4. Report in at most 8 lines:
   - Current phase and branch
   - What was done last session
   - Uncommitted changes, if any
   - The next slice and its prompt, quoted
   - Any open question or blocker from the log
5. Ask me whether to start that slice. Do not write code yet.
