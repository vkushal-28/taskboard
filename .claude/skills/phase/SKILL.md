---
name: phase
description: Start or continue a Taskboard build phase from docs/PLAN.md, slice by slice, with a plan before each slice.
argument-hint: "<phase number, e.g. 2> [slice, e.g. 2.3]"
disable-model-invocation: true
---

Work on Taskboard phase $ARGUMENTS.

1. Read the phase in docs/PLAN.md, CLAUDE.md, and the "Next session starts here" block in docs/PROGRESS.md.
2. If we are not on the phase's branch, create it from an up-to-date main (`git switch main && git pull && git switch -c <branch>`). Ask first if there are uncommitted changes.
3. Pick the first unfinished slice (or the slice I named). For that slice:
   a. Restate the goal in one line and show a plan: files to create or change, approach, any new dependency and why, risks.
   b. Wait for my approval.
   c. Implement it in small steps. Write tests with the code.
   d. Run `pnpm lint`, `pnpm typecheck`, and the relevant tests. Fix failures.
   e. Summarize what changed and explain the non-obvious parts in 2–3 sentences.
   f. Propose a conventional commit message and commit after I confirm.
4. Ask whether to continue to the next slice.
5. When all slices are done, check the phase's exit criteria one by one with evidence (command output), then suggest running /review-phase.
