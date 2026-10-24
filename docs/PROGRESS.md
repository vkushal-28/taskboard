# Progress log

Claude reads this file at the start of every session. Keep the top block current.

## Next session starts here

- **Current phase:** Phase 1 done (PR #2 merged, CI green) → Phase 2 — Boards, lists, cards API + RBAC next
- **Branch:** `main` is up to date with both merges. Phase 2 goes on `feat/boards-api`, which carries this progress commit.
- **Last thing done:** Slices 1.1–1.3 shipped (auth endpoints, ADR 004, 28 auth tests on mongodb-memory-server), /review-phase fixes 1, 3, 4, 7, 8, 9 committed, PR #2 merged. Added `docs/PROJECT-GUIDE.md` (plain-English explainer for non-developers; nothing depends on it).
- **Next step:** `/phase 2` → Slice 2.1 (Board, List, Card, Activity models, Role enum in shared, `requireBoardRole(minRole)` middleware) on `feat/boards-api`.
- **Open questions / blockers:** none. Optional decision still open: an absolute session lifetime (see deferred findings).
- **Notes for Claude:**
  - Start the dev environment: `cp .env.example .env` (if missing) → `docker compose up -d mongo` → `pnpm dev`. Health check: `curl localhost:4000/health` returns `{"status":"ok","db":"connected"}`.
  - `.env` now needs `JWT_ACCESS_SECRET` (≥ 32 chars, `openssl rand -base64 48`) and `CLIENT_URL`. The api refuses to start without the secret; in production it also requires `CLIENT_URL`.
  - The full stack (`docker compose up --build`) and `pnpm dev` both use port 4000. Stop `pnpm dev` first. The user also runs `pnpm dev` from their own terminal, so check port 4000 is free before starting a background dev server.
  - Tests: `test/global-setup.ts` starts one mongodb-memory-server; `test/setup.ts` gives each test file its own database and clears collections after every test. Use `createUser` / `loginAs` / `errorOf` / `userOf` from `apps/api/test/factories.ts`. The first run downloads mongod (~77 MB, cached).
  - Never spy on `mongoose.connection.readyState` in tests: it leaves the shared test connection "disconnected" and teardown hangs. Mock `getDbStatus()` instead (see `app.test.ts`).
  - Zod: validators like `z.email()` check the raw input before `.trim()`. Normalise first: `z.string().trim().toLowerCase().pipe(z.email())`.
  - Throw `AppError` subclasses from `apps/api/src/lib/errors.ts`. `Unauthorized(message, code)` takes an optional code. Validate bodies with `validateBody(schema)`; type the handler with `WithBody<T>` (see `modules/auth/controller.ts`).
  - Read cookies with `readCookie(req, name)` (cookie-parser types `req.cookies` as `any`). `req.userId` is set by `requireAuth`; read it with `getAuthUserId(req)`.
  - Every write passes `requireSameOrigin`: a request with a foreign `Origin` gets 403. Requests without `Origin` (curl, Supertest) pass.
  - Routers are factories (`createAuthRouter()`) so each `createApp()` gets fresh rate-limit counters. Keep that pattern for new routers with limits.
  - ESLint allows unused args that start with `_` (Express error handlers need four params).
  - TypeScript is pinned to 6 because typescript-eslint doesn't support 7 yet (ADR 002). Don't upgrade.
  - `@taskboard/shared` is read from `src` in dev through the `"source"` export condition and from `dist` in production (ADR 003). Any new tool that imports shared must opt into the `source` condition. `pnpm -r build` builds shared first.
  - Express 5 passes `listen` errors to the callback. Use `listen()` from `apps/api/src/lib/listen.ts`.
  - Log errors as `{ err }`, not `{ error }`. Only `err` is serialized by pino.
  - Add new sensitive log paths to `loggerOptions.redact` in `apps/api/src/lib/logger.ts`, and add a test case for each.
  - pnpm 12 fails installs when a dependency's install script is unapproved. Use `pnpm approve-builds <pkg>`, or set `<pkg>: false` under `allowBuilds` in `pnpm-workspace.yaml` to skip it (done for mongodb-memory-server).
  - In zsh, quote `'@taskboard/shared@workspace:*'`.
  - Local Node is 26. The target is Node 22, which CI and Docker use, and `@types/node` is pinned to 22.
  - commitlint requires a scope: `type(scope): subject`.
  - Deferred Phase 0 review findings (low):
    - #7: wrap `connectDb` in `server.ts` with try/catch, then `logger.fatal({ err })` and exit 1.
    - #8: set `PORT: 4000` in the compose api `environment`.
  - Deferred Phase 1 review findings:
    - Phase 7: set `app.set('trust proxy', 1)` on Render. Without it `req.ip` is the proxy, so the auth rate limit is shared by every user (global lockout after 10 logins).
    - Phase 3: the full Docker stack runs `NODE_ENV=production`, so cookies are `Secure; SameSite=None` over http://localhost:8080. Safari drops them. Add a `COOKIE_SECURE` override or test login with `pnpm dev`.
    - Optional: absolute session lifetime (e.g. 30 days per refresh family). Rotation currently slides the 7-day expiry forever.
  - Web client (Phase 3): a refresh 401 with code `REFRESH_TOKEN_ROTATED` means another tab already rotated the cookie. Retry the original request once instead of logging out. Also deduplicate concurrent refreshes within a tab (single-flight).
  - Phase 6: Slice 6.3 plans a MongoDB service container for API tests. mongodb-memory-server already covers that, so the container is only needed for e2e. Consider caching `~/.cache/mongodb-binaries` in CI.
  - `docs/PROJECT-GUIDE.md` is the user's plain-English explainer. Update its phase sections when a phase finishes.
  - GitHub's `ubuntu-latest` is moving to Ubuntu 26. If CI breaks for no clear reason, pin `ubuntu-24.04`.

## Phase checklist

- [x] Phase 0 — Setup and foundations (PR #1, merged)
- [x] Phase 1 — Authentication (PR #2, merged)
- [ ] Phase 2 — Boards, lists, cards API + RBAC
- [ ] Phase 3 — Frontend shell and board UI
- [ ] Phase 4 — Real-time sync and presence
- [ ] Phase 5 — Card detail, comments, activity, invites
- [ ] Phase 6 — Testing and CI hardening
- [ ] Phase 7 — Deploy, seed data, README

## Session log (newest first)

| Date       | Phase    | Done                                                                                                                                                                                                                                            | Decisions / learned                                                                                                                                                                                                                                                            | Next                                |
| ---------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| 2026-10-23 | Phase 1  | Auth: register, login, refresh rotation with reuse detection, logout, /me; AppError + error handler; Helmet, CORS, Origin check, rate limits; ADR 004; mongodb-memory-server test setup; review fixes; PR #2 merged; 61 tests; PROJECT-GUIDE.md | Opaque refresh token stored as SHA-256 hash; 10 s grace window with `REFRESH_TOKEN_ROTATED`; jose + bcryptjs over jsonwebtoken + bcrypt; in-memory Mongo for tests (CI works without a service); z.email() validates before trim; spying on mongoose readyState hangs teardown | Phase 2 Slice 2.1                   |
| 2026-10-22 | Phase 0  | Monorepo, lint/format/hooks, env + logger + Mongo + /health, Docker Compose, CI; review fixes; PR #1 open with CI green; 17 tests                                                                                                               | TS 6 pin (ADR 002); shared from source in dev and dist in prod (ADR 003); /health returns 503 when db down; Express 5 passes listen errors to the callback; pino only serializes errors under `err`; Mongo bound to localhost                                                  | Merge PR #1, then Phase 1 Slice 1.1 |
| 2026-10-22 | Planning | Project chosen, UI designed, docs and starter kit prepared                                                                                                                                                                                      | Zustand + TanStack Query over RTK                                                                                                                                                                                                                                              | Start Phase 0                       |
