---
name: wrap-up
description: End a Taskboard work session. Runs checks, updates docs/PROGRESS.md with a handoff note so the next session can resume, and commits.
disable-model-invocation: true
---

Wrap up this session so tomorrow's session can resume without any chat history.

1. Run `pnpm lint`, `pnpm typecheck` and `pnpm test`. Report failures; do not hide them.
2. Update docs/PROGRESS.md:
   - Rewrite the "Next session starts here" block: current phase, branch, last thing done, the exact next step (slice number), open questions or blockers, notes for Claude (gotchas, half-finished work, commands to run first).
   - Tick finished phases in the checklist.
   - Add one row at the top of the session log: today's date, phase, what was done, decisions or things learned, next.
3. If we made a decision with real alternatives today, propose an ADR title and offer to write it.
4. Show me the diff of docs/PROGRESS.md.
5. After I confirm, commit all work with a conventional commit message, for example `chore(progress): end of session — phase 2 slice 2.3`. If tests are failing, commit as WIP on the feature branch and say so in the progress notes.
