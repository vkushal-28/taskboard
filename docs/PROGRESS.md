# Progress log

Claude reads this file at the start of every session. Keep the top block current.

## Next session starts here

- **Current phase:** Phase 0 done (PR #1 open, CI green) → Phase 1 — Authentication next
- **Branch:** `chore/setup` (PR #1 → `main`, not merged yet). Phase 1 goes on `feat/auth`.
- **Last thing done:** Slices 0.1–0.4 shipped, /review-phase findings 1–6 fixed, PR #1 description updated, CI green on the final commit.
- **Next step:** Merge PR #1, then `/phase 1` → Slice 1.1 (plan the token strategy) on `feat/auth` from an up-to-date `main`.
- **Open questions / blockers:** none.
- **Notes for Claude:**
  - Start the dev environment: `cp .env.example .env` (if missing) → `docker compose up -d mongo` → `pnpm dev`. Health check: `curl localhost:4000/health` returns `{"status":"ok","db":"connected"}`.
  - The full stack (`docker compose up --build`) and `pnpm dev` both use port 4000. Stop `pnpm dev` first.
  - TypeScript is pinned to 6 because typescript-eslint doesn't support 7 yet (ADR 002). Don't upgrade.
  - `@taskboard/shared` is read from `src` in dev through the `"source"` export condition and from `dist` in production (ADR 003). Any new tool that imports shared must opt into the `source` condition. `pnpm -r build` builds shared first.
  - Express 5 passes `listen` errors to the callback. Use `listen()` from `apps/api/src/lib/listen.ts`.
  - Log errors as `{ err }`, not `{ error }`. Only `err` is serialized by pino.
  - Add new sensitive log paths to `loggerOptions.redact` in `apps/api/src/lib/logger.ts`, and add a test case for each.
  - Phase 1 needs new redaction paths: refresh/access token fields and `req.body.password` variants.
  - pnpm 12 fails installs when a dependency's install script is unapproved. Use `pnpm approve-builds <pkg>`, which records it under `allowBuilds` in `pnpm-workspace.yaml`.
  - In zsh, quote `'@taskboard/shared@workspace:*'`.
  - Local Node is 26. The target is Node 22, which CI and Docker use, and `@types/node` is pinned to 22.
  - commitlint requires a scope: `type(scope): subject`.
  - Deferred review findings (low):
    - #7: wrap `connectDb` in `server.ts` with try/catch, then `logger.fatal({ err })` and exit 1.
    - #8: set `PORT: 4000` in the compose api `environment`.
  - Deferred Phase 1 review findings:
    - Phase 7: set `app.set('trust proxy', 1)` on Render. Without it `req.ip` is the proxy, so the auth rate limit is shared by every user (global lockout after 10 logins).
    - Phase 3: the full Docker stack runs `NODE_ENV=production`, so cookies are `Secure; SameSite=None` over http://localhost:8080. Safari drops them. Add a `COOKIE_SECURE` override or test login with `pnpm dev`.
    - Optional: absolute session lifetime (e.g. 30 days per refresh family). Rotation currently slides the 7-day expiry forever.
  - Web client (Phase 3): a refresh 401 with code `REFRESH_TOKEN_ROTATED` means another tab already rotated the cookie. Retry the original request once instead of logging out.
  - GitHub's `ubuntu-latest` is moving to Ubuntu 26. If CI breaks for no clear reason, pin `ubuntu-24.04`.

## Phase checklist

- [x] Phase 0 — Setup and foundations (PR #1, awaiting merge)
- [ ] Phase 1 — Authentication
- [ ] Phase 2 — Boards, lists, cards API + RBAC
- [ ] Phase 3 — Frontend shell and board UI
- [ ] Phase 4 — Real-time sync and presence
- [ ] Phase 5 — Card detail, comments, activity, invites
- [ ] Phase 6 — Testing and CI hardening
- [ ] Phase 7 — Deploy, seed data, README

## Session log (newest first)

| Date       | Phase    | Done                                                                                                                              | Decisions / learned                                                                                                                                                                                                           | Next                                |
| ---------- | -------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| 2026-10-22 | Phase 0  | Monorepo, lint/format/hooks, env + logger + Mongo + /health, Docker Compose, CI; review fixes; PR #1 open with CI green; 17 tests | TS 6 pin (ADR 002); shared from source in dev and dist in prod (ADR 003); /health returns 503 when db down; Express 5 passes listen errors to the callback; pino only serializes errors under `err`; Mongo bound to localhost | Merge PR #1, then Phase 1 Slice 1.1 |
| 2026-10-22 | Planning | Project chosen, UI designed, docs and starter kit prepared                                                                        | Zustand + TanStack Query over RTK                                                                                                                                                                                             | Start Phase 0                       |
