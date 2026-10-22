---
name: review-phase
description: Senior-level review of the current branch before opening a pull request for a Taskboard phase.
disable-model-invocation: true
---

Review the current branch against main as a strict senior engineer would before a PR.

1. Run `git diff main...HEAD --stat`, then read the changed files.
2. Check and report findings ranked by severity, with file and line:
   - Correctness and edge cases
   - Security: auth checks, RBAC on every board-scoped route and socket event, input validation, secrets, cookie flags
   - Data: indexes, N+1 queries, unbounded queries without pagination
   - Real-time: events emitted only after successful writes, no duplicate client updates
   - Rules in CLAUDE.md that were broken
   - Missing tests for business logic
   - Dead code, leftover console.logs, TODOs
3. Do not change code yet. Ask which findings to fix.
4. After fixes, draft the PR description: What, Why, How to test, Screenshots needed, Checklist. Then offer to open it with `gh pr create`.
