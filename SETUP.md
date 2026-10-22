# Taskboard starter kit for Claude Code

Drop these files into an empty repo, then follow the steps. Delete this file once you're set up.

## What's inside

| File                  | What it does                                                                                                |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| CLAUDE.md             | Project memory. Claude Code loads it automatically every session.                                           |
| docs/PLAN.md          | The 8 phases, split into slices, each with a ready prompt.                                                  |
| docs/PROGRESS.md      | Handoff log. `/wrap-up` writes it, `/start` reads it. This is how Claude "remembers" yesterday.             |
| docs/adr/             | Architecture decision records (template + ADR 001).                                                         |
| .claude/skills/       | Project commands: `/start`, `/phase`, `/review-phase`, `/wrap-up`, `/adr`.                                  |
| .claude/settings.json | Hook: runs Prettier on every file Claude edits (needs `jq`; Prettier installs in Phase 0).                  |
| .mcp.json             | MCP servers: Context7 (current library docs), Playwright (drives a browser), MongoDB (read-only DB access). |

## One-time setup

```bash
# 1. Create the repo and copy the kit in
mkdir taskboard && cd taskboard && git init
# copy all kit files here (including the hidden .claude folder and .mcp.json)
git add -A && git commit -m "chore: add Claude Code starter kit"

# 2. Create the GitHub repo and push (GitHub CLI)
gh repo create taskboard --public --source=. --push

# 3. Start Claude Code in the repo
claude
```

Inside Claude Code:

```
/plugin install commit-commands@claude-plugins-official
/plugin install code-review@claude-plugins-official
/plugin install frontend-design@claude-plugins-official
/plugin install security-guidance@claude-plugins-official
```

Approve the project MCP servers when Claude Code asks (or check with `/mcp`).

## Daily loop

1. `cd taskboard && claude`
2. `/start` — Claude reads PROGRESS.md and git, tells you where you are
3. `/phase <n>` — work slice by slice (plan -> approve -> code -> checks -> commit)
4. `/review-phase` before opening each PR
5. `/wrap-up` at the end of the day — updates PROGRESS.md and commits

Same-day pick-up after closing the terminal: `claude --continue` (latest session) or `claude --resume` (choose one). Next day, prefer a fresh session with `/start`: it rebuilds context from files, which is cleaner than a long old chat.
