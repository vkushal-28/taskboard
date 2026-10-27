# Progress log

Claude reads this file at the start of every session. Keep the top block current.

## Next session starts here

- **Current phase:** Phase 3 done (PR #4 and the review fixes in PR #5 merged, CI green) → Phase 4 — Real-time sync and presence next
- **Branch:** `main` has every merge up to PR #5. Phase 4 goes on `feat/realtime`, which carries this progress commit.
- **Last thing done:** Slices 3.1–3.3 shipped (app shell and auth, My boards with `GET /activity/recent`, board view with dnd-kit and optimistic moves). Then `/review-phase`, with fixes in PR #5: dropping below the last card, `COOKIE_SECURE`, duplicate-safe creates, honest sign-out failure, `useNow()`, and ADRs 008 and 009. 342 tests.
- **Next step:** `/phase 4` → Slice 4.1 (Socket.IO on the HTTP server, handshake auth from the access-token cookie, `board:join` with a membership check, and an `emitToBoard` service called after DB writes) on `feat/realtime`.
- **Open questions / blockers:** none. Optional decision still open: an absolute session lifetime (see the deferred Phase 1 findings).
- **Notes for Claude:**
  - Start the dev environment: `cp .env.example .env` (if missing) → `docker compose up -d mongo` → `pnpm dev`. Health check: `curl localhost:4000/health` returns `{"status":"ok","db":"connected"}`.
  - **Port 4000 gotcha:** an old `taskboard-api` Docker container can hold port 4000. `pnpm dev` then can't bind, and the web app talks to a stale api (in Phase 3 this showed as "Something went wrong" on register). Check with `lsof -iTCP:4000 -sTCP:LISTEN`, and fix with `docker compose stop api web`. The Docker images only change with `docker compose up --build`.
  - The user also runs `pnpm dev` from their own terminal and uses the same Playwright browser window. Before browser checks, check port 4000, test in a **new tab** on a throwaway board, and delete it afterwards. Don't drive their tab.
  - `.env` needs `JWT_ACCESS_SECRET` (≥ 32 chars, `openssl rand -base64 48`), `CLIENT_URL` and `VITE_API_URL=http://localhost:4000`. Vite reads the root `.env` (`envDir: '../..'`) and only exposes `VITE_*` keys. The api refuses to start without the secret; in production it also requires `CLIENT_URL`.
  - `COOKIE_SECURE` (optional) defaults to on in production. docker-compose sets it to `false`, because the stack is a production build over plain http and Safari drops Secure cookies. Insecure cookies use `SameSite=Lax`. It refuses `false` with an `https` `CLIENT_URL`.
  - The full stack (`docker compose up --build`, web on :8080) and `pnpm dev` both use port 4000. Stop one before starting the other.
  - Tests: `test/global-setup.ts` starts one mongodb-memory-server; `test/setup.ts` gives each test file its own database and clears collections after every test. The first run downloads mongod (~77 MB, cached).
  - Test factories (`apps/api/test/factories.ts`): `createUser`, `loginAs`, `accessCookieFor(user)` (a Cookie header without logging in), `createBoard`, `createBoardWithRoles()` (owner, member, viewer, outsider), `createList` / `createCard` (positions default to after the last one, so create them **sequentially**, not with `Promise.all`), `parseBody(schema, res)`, `errorOf`, `userOf`.
  - Never spy on `mongoose.connection.readyState` in tests: it leaves the shared test connection "disconnected" and teardown hangs. Mock `getDbStatus()` instead (see `app.test.ts`).
  - Board routes: `requireAuth` then `requireBoardRole(minRole)` then `validateBody`. Role checks run before validation so viewers get 403, not 400. Controllers read the result with `getBoardContext(req)` and route params with `requireParam(req.params, name)` (Express 5 types params as `string | string[]`). Query strings: `parseQuery(schema, req.query)` in the controller (Express 5 `req.query` is read-only).
  - The lists and cards routers are mounted at the app root and authenticate per route. Don't use `router.use(requireAuth)` in a router that shares a prefix with another one.
  - A new board-scoped endpoint needs a row in `docs/permissions.md` **and** an entry in `ENDPOINTS` in `apps/api/src/rbac.test.ts`. `GET /activity/recent` is not board-scoped: it filters by membership in the service.
  - Ordering: any write that sets a `position` goes through `writeAtPosition(before, after, write)` in `lib/position.ts`. Positions are unique per board (lists) and per list (cards); retries pick a random key in the gap (ADR 007). Sort with `BY_POSITION` (`{ position: 1, _id: 1 }`). Stale neighbours return 409 `CONFLICT`; the client refetches.
  - fractional-indexing 4 silently accepts swapped bounds. On the api, `positionBetween` checks the order itself; don't call `generateKeyBetween` directly there. The web only uses it for the optimistic position in `planMove()`.
  - Card queries must include `boardId`: the only cards index is `{ boardId, listId, position }`, and a `listId`-only query scans the whole collection. Lookups by `_id` are fine.
  - Mongo: `{ position: {} }` matches nothing, so use `positionGap()` for range filters. Mongoose drops empty objects on save unless the schema sets `minimize: false` (done for Activity `meta`).
  - No multi-document transactions (ADR 006). Order multi-step writes so a crash leaves unreachable data: delete children before a list, but the board before its children.
  - `logActivity` runs after each successful write and never throws. **Phase 4: emit socket events at the same points, after the write.**
  - Non-members get 404, members below the min role get 403 (ADR 005). For Phase 4 socket joins, reuse `findMemberRole` from `modules/boards/access.ts`.
  - Mongoose typings: `new Error.DocumentNotFoundError(message: string)`, though the runtime takes a filter.
  - Zod: validators like `z.email()` check the raw input before `.trim()`. Normalise first: `z.string().trim().toLowerCase().pipe(z.email())`. `z.stringbool()` parses `"true"`/`"false"` env vars.
  - Throw `AppError` subclasses from `apps/api/src/lib/errors.ts`. `Unauthorized(message, code)` takes an optional code. Validate bodies with `validateBody(schema)`; type the handler with `WithBody<T>` from `middleware/validate.ts`.
  - Read cookies with `readCookie(req, name)` (cookie-parser types `req.cookies` as `any`). `req.userId` is set by `requireAuth`; read it with `getAuthUserId(req)`.
  - Every write passes `requireSameOrigin`: a request with a foreign `Origin` gets 403. Requests without `Origin` (curl, Supertest) pass.
  - Routers are factories (`createAuthRouter()`, `createBoardsRouter()`, `createActivityRouter()`, …) so each `createApp()` gets fresh rate-limit counters. Keep that pattern.
  - **Web architecture (Phase 3):**
    - All calls go through `api.request(path, { method, body, schema, signal })` from `lib/api.ts`. It checks responses against the shared Zod schemas, refreshes once on a 401 (single-flight per tab), retries on `REFRESH_TOKEN_ROTATED`, and calls `clearSession()` when the session is gone.
    - Query keys: `authKeys` (`features/auth/keys.ts`), `boardKeys` (`features/boards/api.ts`), `activityKeys` (`features/activity/api.ts`). The board view reads `boardKeys.detail(boardId)` (a `BoardDetail`).
    - `clearSession()` sets the user to `null` **in place** and removes the other queries. Never `queryClient.clear()`: it detaches the route guards that observe the auth query.
    - Card ordering logic is pure and unit-tested in `features/board/ordering.ts`: `groupCards`, `planMove`, `applyMove`, `dropOrder`, `replaceCard`.
    - `useMoveCard` does the optimistic update (ADR 009). `BoardCanvas` keeps a drag working copy, and after a drop it holds that copy until the cache changes (`drag.base === detail`). Don't clear it on drop, or the drop animation flies to the old list.
    - Collision detection is `pointerWithin` first, then `closestCorners`. `closestCorners` alone picks the neighbouring column now that whole columns are drop targets.
    - **Phase 4:** cache writes from socket events must be idempotent (creates already use `appendIfMissing`), must skip events whose `actorId` is the current user, and need a refetch on reconnect. Mind an in-flight move: a socket update for the same card should not undo the optimistic state.
    - Toasts: `showToast(message, tone)` from `lib/toast-store.ts` (Zustand, UI state only). `<Toaster />` is in the root layout route.
    - Render must be pure: read the clock with `useNow()` (`lib/time.ts`), not `Date.now()` in render. `formatRelative(iso, now)` requires `now`.
    - dnd-kit gives sortable cards `role="button"`; tests find cards by `data-testid="card-<id>"`, lists by `data-testid="list-<id>"`. jsdom can't test real drag gestures. Use the pure functions plus a Playwright check.
    - jsdom has no `<dialog>` methods; `src/test/setup.ts` stubs `showModal`/`close`. Test helpers: `renderApp(path)`, `stubApi({ 'METHOD /path': handler })`, `emptyHomeHandlers` (`src/test/render.tsx`), and board fixtures in `src/test/board-fixtures.ts`.
    - After every `pnpm add`, run `pnpm peers check`. react-router 8 silently needed React 19 (ADR 008).
  - ESLint allows unused args that start with `_` (Express error handlers need four params). The `react-hooks` purity rule flags `Date.now()` in render; `act(() => vi.advanceTimersByTime(n))` needs braces (it returns `vi`, so the callback isn't void).
  - TypeScript is pinned to 6 because typescript-eslint doesn't support 7 yet (ADR 002). Don't upgrade.
  - `@taskboard/shared` is read from `src` in dev through the `"source"` export condition and from `dist` in production (ADR 003). Any new tool that imports shared must opt into the `source` condition. `pnpm -r build` builds shared first.
  - Express 5 passes `listen` errors to the callback. Use `listen()` from `apps/api/src/lib/listen.ts`.
  - Log errors as `{ err }`, not `{ error }`. Only `err` is serialized by pino.
  - Add new sensitive log paths to `loggerOptions.redact` in `apps/api/src/lib/logger.ts`, and add a test case for each.
  - pnpm 12 fails installs when a dependency's install script is unapproved. Use `pnpm approve-builds <pkg>`, or set `<pkg>: false` under `allowBuilds` in `pnpm-workspace.yaml` to skip it (done for mongodb-memory-server).
  - In zsh, quote `'@taskboard/shared@workspace:*'`.
  - Local Node is 26. The target is Node 22, which CI and Docker use, and `@types/node` is pinned to 22.
  - commitlint requires a scope: `type(scope): subject`.
  - When a phase PR is merged before the wrap-up commit, put the progress commit on the next phase's branch.
  - Local dev data: a smoke-test user `smoke-1027@example.com` / `long-enough-pw` with the boards "Website Redesign" and "Webste testing" (the user made the second). Safe to delete.
  - Deferred Phase 0 review findings (low):
    - #7: wrap `connectDb` in `server.ts` with try/catch, then `logger.fatal({ err })` and exit 1.
    - #8: set `PORT: 4000` in the compose api `environment`.
  - Deferred Phase 1 review findings:
    - Phase 7: set `app.set('trust proxy', 1)` on Render. Without it `req.ip` is the proxy, so the auth rate limit is shared by every user (global lockout after 10 logins).
    - Optional: absolute session lifetime (e.g. 30 days per refresh family). Rotation currently slides the 7-day expiry forever.
  - Deferred Phase 2 review findings:
    - Phase 6 (#5): no caps or pagination. Add limits (e.g. 100 lists and 1,000 cards per board, a max position length) and paginate `GET /boards`. Repeated splits of one gap grow position keys with no rebalancing. `GET /activity/recent` also loads every board the user belongs to.
    - #7: `GET /boards` sorts by `board.updatedAt`, which only changes on rename or recolor. If My boards needs "recent", add `lastActivityAt` and bump it in `logActivity`.
  - Deferred Phase 3 review findings (low, for the Phase 7 polish):
    - L4: cards are `role="button"` inside an `<ol>` (list semantics lost), and `aria-label={card.title}` hides labels, due date and checklist from screen readers.
    - L5: the account menu (`<details>`) doesn't close on Esc or an outside click.
    - L6: the search box is hidden below the `sm` breakpoint.
    - L8: exports only used in their own file (`BOARD_COLORS`, `initialsOf`, `TOAST_DURATION_MS`, `RedirectState`, `createQueryClient`, `OWNER`).
    - L9: on the board page the header is `max-w-7xl` and the board is full width, so they don't line up.
    - L10: `redirectTarget` also accepts `/\evil.com` (defence in depth only; `location.state` can't be set by another site).
    - Also deferred: list drag-reorder (the api supports it), comment counts on cards (Phase 5).
  - The design screens are not in the repo. Phase 3 was built from the plan's descriptions; ask the user for them before claiming "matches the design".
  - Phase 6: Slice 6.3 plans a MongoDB service container for API tests. mongodb-memory-server already covers that, so the container is only needed for e2e. Consider caching `~/.cache/mongodb-binaries` in CI.
  - `docs/PROJECT-GUIDE.md` is the user's plain-English explainer. Update its phase sections when a phase finishes (Phase 3 is in).
  - GitHub's `ubuntu-latest` is moving to Ubuntu 26. If CI breaks for no clear reason, pin `ubuntu-24.04`.

## Phase checklist

- [x] Phase 0 — Setup and foundations (PR #1, merged)
- [x] Phase 1 — Authentication (PR #2, merged)
- [x] Phase 2 — Boards, lists, cards API + RBAC (PR #3, merged)
- [x] Phase 3 — Frontend shell and board UI (PR #4, review fixes PR #5, merged)
- [ ] Phase 4 — Real-time sync and presence
- [ ] Phase 5 — Card detail, comments, activity, invites
- [ ] Phase 6 — Testing and CI hardening
- [ ] Phase 7 — Deploy, seed data, README

## Session log (newest first)

| Date       | Phase    | Done                                                                                                                                                                                                                                                                                                                                                                                   | Decisions / learned                                                                                                                                                                                                                                                                                                                                                                               | Next                                |
| ---------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| 2026-10-27 | Phase 3  | Slices 3.1–3.3: app shell, api client with single-flight refresh, auth pages; My boards and `GET /activity/recent`; board view with dnd-kit and optimistic moves; fixed the drop animation; `/review-phase` fixes (drop below last card, `COOKIE_SECURE`, idempotent creates, honest sign-out failure, `useNow`); ADRs 008–009; PROJECT-GUIDE Phase 3; PRs #4 and #5 merged; 342 tests | react-router 8 needs React 19, so pinned 7 (ADR 008); `queryClient.clear()` detaches the route guards; a stale Docker api on :4000 broke register; optimistic write after an `await` made the drop animation fly to the old list, so the drag copy is held until the cache changes; whole-column drop targets need `pointerWithin` before `closestCorners`; Safari drops Secure cookies over http | Phase 4 Slice 4.1                   |
| 2026-10-24 | Phase 2  | Committed Phase 1 wrap-up; Slices 2.1–2.4: Board/List/Card/Activity models, Role enum, `requireBoardRole`, boards/lists/cards modules, fractional ordering, RBAC matrix test; ADRs 005–007; review fixes; PROJECT-GUIDE Phase 2; PR #3 merged; 239 tests                                                                                                                               | Members embedded in board, non-members 404 (ADR 005); no transactions, ordered writes (ADR 006); unique positions + random retry (ADR 007; stepping one key failed a 5-way concurrency test); fractional-indexing 4 accepts swapped bounds; listId-only card queries skip the index; Mongoose `minimize` drops empty `meta`                                                                       | Phase 3 Slice 3.1                   |
| 2026-10-23 | Phase 1  | Auth: register, login, refresh rotation with reuse detection, logout, /me; AppError + error handler; Helmet, CORS, Origin check, rate limits; ADR 004; mongodb-memory-server test setup; review fixes; PR #2 merged; 61 tests; PROJECT-GUIDE.md                                                                                                                                        | Opaque refresh token stored as SHA-256 hash; 10 s grace window with `REFRESH_TOKEN_ROTATED`; jose + bcryptjs over jsonwebtoken + bcrypt; in-memory Mongo for tests (CI works without a service); z.email() validates before trim; spying on mongoose readyState hangs teardown                                                                                                                    | Phase 2 Slice 2.1                   |
| 2026-10-22 | Phase 0  | Monorepo, lint/format/hooks, env + logger + Mongo + /health, Docker Compose, CI; review fixes; PR #1 open with CI green; 17 tests                                                                                                                                                                                                                                                      | TS 6 pin (ADR 002); shared from source in dev and dist in prod (ADR 003); /health returns 503 when db down; Express 5 passes listen errors to the callback; pino only serializes errors under `err`; Mongo bound to localhost                                                                                                                                                                     | Merge PR #1, then Phase 1 Slice 1.1 |
| 2026-10-22 | Planning | Project chosen, UI designed, docs and starter kit prepared                                                                                                                                                                                                                                                                                                                             | Zustand + TanStack Query over RTK                                                                                                                                                                                                                                                                                                                                                                 | Start Phase 0                       |
