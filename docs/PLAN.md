# Taskboard — build plan and prompts

8 phases, about 7 working days. One phase = one feature branch = one pull request.
Run a phase with `/phase <number>`; the skill reads this file and walks the slices below.

Prompts are written so you can also paste them by hand. Each slice: plan -> approve -> code -> run checks -> review diff -> commit.

---

## Phase 0 — Setup and foundations (Day 1, morning)

**Branch:** `chore/setup`
**Goal:** a running monorepo with tooling, Docker and CI from the first commit.

### Slice 0.1 — Monorepo skeleton

```
Create a pnpm workspace monorepo for Taskboard following CLAUDE.md:
- apps/api: Express + TypeScript (strict), tsx for dev, a GET /health route
- apps/web: React + Vite + TypeScript + Tailwind, one placeholder page
- packages/shared: Zod, exports an empty index for now
- root: tsconfig.base.json, pnpm-workspace.yaml, root scripts dev/lint/typecheck/test/build that run across packages
Propose the file tree and package.json scripts first. Do not install extra libraries beyond what this needs.
```

### Slice 0.2 — Quality tooling

```
Add ESLint (flat config, typescript-eslint, react-hooks), Prettier, Husky + lint-staged (lint and format staged files), and commitlint with the conventional config. Make `pnpm lint` and `pnpm typecheck` pass. Show me the configs before writing them.
```

### Slice 0.3 — Config, logging, Docker

```
In apps/api: add Zod-validated env loading (src/config/env.ts) that fails fast with a clear message, a Pino logger, Mongoose connection with graceful shutdown, and make /health return { status, db }.
Add docker-compose.yml with mongo (with a volume), api and web, plus a .env.example. Add Dockerfiles for api and web (multi-stage).
```

### Slice 0.4 — CI

```
Add .github/workflows/ci.yml: on pull_request and push to main, set up Node 22 and pnpm with caching, install with --frozen-lockfile, then lint, typecheck, test, build. Keep it one job for now.
```

**Exit criteria:** `docker compose up` works · `/health` returns 200 with db status · CI is green on the first PR.

---

## Phase 1 — Authentication (Day 1, afternoon)

**Branch:** `feat/auth`
**Goal:** register, login, stay logged in, logout — securely.

### Slice 1.1 — Plan the token strategy

```
Before coding, explain the auth design you would use for Taskboard: access token (15 min) + refresh token (7 days) in httpOnly cookies, refresh rotation with reuse detection, where refresh tokens are stored, cookie flags for local vs production (Vercel web + Render api), and CSRF considerations. List the files you will create. Then wait.
```

### Slice 1.2 — Implement

```
Implement apps/api/src/modules/auth per the approved plan: User model, shared Zod schemas (registerSchema, loginSchema) in packages/shared, register, login, refresh, logout, GET /auth/me, requireAuth middleware, bcrypt hashing, rate limiting on auth routes, Helmet and CORS (CLIENT_URL, credentials true). Add the AppError classes and central error handler if missing.
```

### Slice 1.3 — Tests

```
Write Supertest tests for auth: register (success, duplicate email, invalid body), login (success, wrong password), refresh (rotates token, reused token is rejected), logout, /me with and without a cookie. Use a test database and a factory in apps/api/test/factories.ts.
```

**Exit criteria:** all auth routes tested · passwords never returned or logged · rate limit works.

---

## Phase 2 — Boards, lists and cards API with RBAC (Day 2)

**Branch:** `feat/boards-api`
**Goal:** the full data model and REST API, protected by board roles.

### Slice 2.1 — Models and permission middleware

```
Create Board (title, color, ownerId, members [{userId, role}], invites), List (boardId, title, position), Card (boardId, listId, title, description, position, labels, assignees, dueDate, checklist [{text, done}], archived) and Activity (boardId, cardId, actorId, type, meta) models with indexes { boardId, position } and { boardId, listId, position }.
Add Role enum to packages/shared and requireBoardRole(minRole) middleware that resolves boardId from params (board, list or card id). Unit-test the role rank helper.
```

### Slice 2.2 — Boards and lists

```
Implement boards module: GET /boards (owned + shared, with my role), POST /boards (creator becomes owner, seed lists To Do / In Progress / Done), GET /boards/:boardId returning board + lists + cards in one response, PATCH and DELETE (owner only). Then lists: create, rename, reorder, delete (member+). Log Activity for each write.
```

### Slice 2.3 — Cards and ordering

```
Implement cards module: create in list, GET one, PATCH fields, DELETE/archive, and PATCH /cards/:cardId/move { listId, beforeId?, afterId? } that computes a fractional position with the fractional-indexing package. Explain how you avoid position collisions. Log Activity.
```

### Slice 2.4 — RBAC tests

```
Write API tests that walk the permission matrix in docs: for each write endpoint, owner and member succeed (where allowed), viewer gets 403, non-member gets 403 or 404, unauthenticated gets 401. Use a helper to create a board with all three roles.
```

**Exit criteria:** every route validates and checks role · viewer write = 403 (tested) · a move updates one document.

---

## Phase 3 — Frontend shell and board UI (Day 3)

**Branch:** `feat/web-board`
**Goal:** Sign in, My boards and Board screens from the design, with drag and drop.

### Slice 3.1 — App shell and auth

```
In apps/web: set up React Router with protected routes, an API client (fetch with credentials: 'include') that retries once after calling /auth/refresh on a 401, TanStack Query provider, and an useAuth hook backed by /auth/me. Build Sign in and Register pages with React Hook Form + the shared Zod schemas. Match the design: dark brand panel left, form right, GitHub button, demo login hint.
```

### Slice 3.2 — My boards

```
Build the My boards page: header (logo, nav, search, avatar), greeting, "Your boards" and "Shared with you" grids with role badges, create-board dialog, recent activity list. Use query hooks in features/boards/api.ts.
```

### Slice 3.3 — Board view with drag and drop

```
Build the board page: header with title, role badge, presence placeholder, Filter and Share buttons; horizontally scrolling lists; cards showing labels, due date, checklist count, comment count and assignee avatars; add card and add list inline forms.
Use dnd-kit to drag cards within and across lists. On drop, update the TanStack Query cache optimistically, call the move endpoint, roll back and show a toast on error. Explain the optimistic update code.
```

**Exit criteria:** UI matches design screens 1–3 · order survives refresh · failed move rolls back.

---

## Phase 4 — Real-time sync and presence (Day 4)

**Branch:** `feat/realtime`
**Goal:** two people on one board see changes and presence live.

### Slice 4.1 — Socket server

```
Plan then implement Socket.IO on the existing HTTP server: authenticate the handshake from the access-token cookie, board:join checks membership before socket.join(`board:${id}`), and a small emitter service so modules call emitToBoard(boardId, event, payload) after DB writes. Event names come from packages/shared.
```

### Slice 4.2 — Client sync

```
Add a useBoardSocket(boardId) hook in apps/web: joins the room, applies card:created/updated/moved/deleted and list:* events to the TanStack Query cache, and ignores events whose actorId is the current user (already applied optimistically). Handle reconnect by refetching the board.
```

### Slice 4.3 — Presence and live cues

```
Add presence: track sockets per board on the server, broadcast presence:update, show online avatars and "N online" in the board header. Add card:dragging (broadcast only, not saved) to show "<name> is moving this", and an activity toast for other people's moves.
```

**Exit criteria:** two windows stay in sync · non-member cannot join room · presence updates on tab close.

---

## Phase 5 — Card detail, comments, activity, invites (Day 5)

**Branch:** `feat/card-detail-sharing`
**Goal:** Card detail and Share & roles screens, fully working.

### Slice 5.1 — Card detail modal

```
Build the card detail modal (route /b/:boardId/c/:cardId): title, list name, assignees, labels, due date, description editor, checklist with progress bar, Add-to-card and Actions sidebar, activity list. Hide write controls for viewers (the API already rejects them).
```

### Slice 5.2 — Comments and activity

```
Add comments module (GET paginated by cursor, POST) with comment:created broadcast, and the board/card activity endpoints with cursor pagination. Wire the modal's comment box and live updates.
```

### Slice 5.3 — Invites and roles

```
Implement invites: POST /boards/:id/invites (owner) creates a random token, stores only its hash with a 7-day expiry, sends an email via Resend (console log in development); POST /invites/:token/accept; resend; revoke. Members: change role, remove member (owner only, cannot remove the last owner). Build the Share dialog from the design. Add tests for expired, revoked and reused tokens.
```

**Exit criteria:** invite accept lands with correct role · bad tokens fail cleanly · viewer is read-only end to end.

---

## Phase 6 — Testing and CI hardening (Day 6)

**Branch:** `test/hardening`

### Slice 6.1 — Coverage review

```
Run the test suite with coverage. List untested business logic in apps/api ranked by risk, then add tests for the top items: ordering helper edge cases, token rotation, permission helper, socket join authorization.
```

### Slice 6.2 — Frontend and E2E

```
Add React Testing Library tests for the board (renders lists and cards, viewer sees no add buttons) and the card modal. Add one Playwright test in e2e/: sign in with a seeded user, create board, add list and card, drag the card to another list, reload, assert it stayed. Use data-testid attributes.
```

### Slice 6.3 — CI

```
Update ci.yml: MongoDB service container for API tests, coverage upload as an artifact, a separate e2e job that runs docker compose and Playwright on push to main. Add Dependabot config and a pnpm audit step. Keep total CI time under 8 minutes.
```

**Exit criteria:** CI green on every PR · api coverage ≥ 70% · branch protection on main.

---

## Phase 7 — Deploy, seed data, README (Day 7)

**Branch:** `chore/deploy`

### Slice 7.1 — Production config

```
Prepare production: cookies with Secure and SameSite=None in production, trust proxy for Render, CORS for the Vercel domain, Socket.IO CORS, a production start script. List every env var needed on Render and Vercel. Explain the cross-site cookie risk and how we handle it.
```

### Slice 7.2 — Deploy pipeline and seed

```
Add .github/workflows/deploy.yml: on push to main after CI passes, trigger the Render deploy hook (secret), then poll API /health until 200 or fail after 5 minutes. Add a seed script that creates the demo user priya@acme.dev and the "Website Redesign" board with the cards from the design.
```

### Slice 7.3 — README and polish

```
Write README.md: one-line pitch, live demo link + demo login, screenshot/GIF placeholders, features, architecture diagram (Mermaid), tech stack with reasons, local setup in 3 commands, testing, CI/CD, project structure, ADR links, what I would do next. Then do a polish pass: loading skeletons, empty states, error toasts, keyboard focus states.
```

**Exit criteria:** live URL works in incognito with demo login · merge to main auto-deploys · stranger can run it locally.
