# Taskboard — project memory for Claude Code

Taskboard is a real-time collaborative Kanban app (mini Trello) built as a portfolio project.
Full plan: @docs/PLAN.md · Current status and handoff notes: @docs/PROGRESS.md

## Start of every session

1. Read docs/PROGRESS.md (the "Next session starts here" block) and the last 10 commits (`git log --oneline -10`).
2. Tell me in 3–5 lines: current phase, what is done, what is next.
3. Wait for my go-ahead before writing code.

## End of every session

Run the /wrap-up skill: update docs/PROGRESS.md, then commit.

## Stack

- pnpm monorepo: apps/api, apps/web, packages/shared, e2e/
- apps/api: Node 22, Express, Mongoose, Socket.IO, Zod, Pino, JWT (httpOnly cookies)
- apps/web: React 18, Vite, TypeScript, Tailwind, TanStack Query (server state), Zustand (UI state only), React Hook Form + Zod, dnd-kit, React Router
- packages/shared: Zod schemas, inferred types, Role enum, socket event names
- Tests: Vitest, Supertest, React Testing Library, Playwright
- DevOps: Docker Compose, GitHub Actions, Render (api), Vercel (web), MongoDB Atlas

## Architecture rules

- TypeScript strict. No `any`, no `@ts-ignore` without a comment explaining why.
- All request bodies, params and env vars are validated with Zod. Schemas live in packages/shared when the client also needs them.
- API layering: routes -> controller -> service -> model. Controllers never touch Mongoose directly.
- Every board-scoped route uses `requireBoardRole(minRole)`. Role rank: viewer < member < owner.
- Writes go through REST. Services emit Socket.IO events to the board room only AFTER a successful DB write. Sockets never write to the DB.
- Card and list order uses fractional indexing (string `position`). A move updates one document.
- Throw typed `AppError` subclasses (NotFound, Forbidden, ValidationError, Unauthorized); the central error handler formats responses as `{ error: { code, message, details? } }`.
- Never log passwords, tokens or cookies.
- Server state lives in TanStack Query. Do not copy API data into Zustand.

## Code style

- Feature folders: apps/api/src/modules/<feature>/{routes,controller,service,model,schemas,*.test}.ts
- apps/web/src/features/<feature>/ for pages, components and hooks of one feature
- Named exports. Small functions. Descriptive names over comments.
- Tests live next to the code as *.test.ts(x). Every feature ships with tests.

## Commands

- `docker compose up -d mongo` — start the database
- `pnpm dev` — run api and web
- `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm e2e`
- `pnpm --filter api test -- <pattern>` — run one api test file

## How to work with me

- For anything bigger than a small fix: propose a plan first (files to create or change, approach, tradeoffs), then wait.
- Work in small slices. After each slice: run lint, typecheck and tests, and show me the result.
- Use conventional commits (feat:, fix:, test:, docs:, chore:, refactor:) with a scope, e.g. `feat(api): add card move endpoint`.
- If a decision has real alternatives, suggest an ADR in docs/adr/.
- Explain non-obvious code in 2–3 sentences after writing it. I need to be able to defend every line in an interview.
- Do not add new dependencies without telling me why.
