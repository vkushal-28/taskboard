# Taskboard — the plain-English guide

This document explains **what** we are building, **how** we are building it, and **why** every tool and decision was chosen. It is written so that anyone — a recruiter, a friend learning to code, or you in six months — can read it from top to bottom and understand the project.

It is a standalone explanation. Nothing in the code depends on it.

_Last updated: 2026-10-24 (Phases 0, 1 and 2 done)._

---

## Contents

1. [What is Taskboard?](#1-what-is-taskboard)
2. [How the work is organised](#2-how-the-work-is-organised)
3. [The big picture: how the pieces fit](#3-the-big-picture-how-the-pieces-fit)
4. [Phase 0 — Setup and foundations (done)](#4-phase-0--setup-and-foundations-done)
5. [Phase 1 — Authentication (done)](#5-phase-1--authentication-done)
6. [Phase 2 — Boards, lists and cards API (done)](#6-phase-2--boards-lists-and-cards-api-done)
7. [Phases still to come](#7-phases-still-to-come)
8. [Every tool and package, and why](#8-every-tool-and-package-and-why)
9. [Decisions we wrote down (ADRs)](#9-decisions-we-wrote-down-adrs)
10. [Glossary](#10-glossary)

---

## 1. What is Taskboard?

Taskboard is a **real-time collaborative Kanban board** — a small version of Trello.

- A **board** is a project (for example "Website Redesign").
- A board has **lists** (columns), such as _To Do_, _In Progress_, _Done_.
- Lists hold **cards** (tasks). You drag cards between lists as work moves forward.
- Several people can open the same board at once and see each other's changes **live**, without refreshing.
- Each person on a board has a **role**: _owner_ (full control), _member_ (can edit), or _viewer_ (read-only).

It is a portfolio project: the goal is a working, deployed app whose code is clean enough to explain line by line in a job interview.

---

## 2. How the work is organised

### Phases and slices

The project is split into **8 phases** (about 7 working days). Each phase is one feature, built on its own git branch and merged through one pull request.

Each phase is split into small **slices**. Every slice follows the same loop:

1. **Plan** — describe what will change and why, before touching code.
2. **Approve** — the plan is reviewed and agreed.
3. **Code** — write the change.
4. **Check** — run lint, typecheck and tests, and look at the results.
5. **Review** — read the diff.
6. **Commit** — save the change with a clear message.

Small slices keep every change easy to review and easy to undo.

### Working with an AI pair programmer

The code is written together with **Claude Code**, an AI coding assistant that runs in the terminal. To keep it consistent across sessions, the project has a few "memory" files:

| File               | Purpose                                                                            |
| ------------------ | ---------------------------------------------------------------------------------- |
| `CLAUDE.md`        | The house rules: stack, architecture rules, code style, how to work.               |
| `docs/PLAN.md`     | The full plan: every phase and slice, with the exact instructions.                 |
| `docs/PROGRESS.md` | A logbook: what was done, what is next, lessons learned.                           |
| `docs/adr/`        | Records of important decisions (see [section 9](#9-decisions-we-wrote-down-adrs)). |

Each session starts by reading the progress log and ends by updating it, so no context is lost between days.

### Commit messages

Every commit follows **Conventional Commits**: `type(scope): what changed`, for example `feat(auth): add login endpoint` or `fix(api): handle missing cookie`. The type (`feat`, `fix`, `test`, `docs`, `chore`, `refactor`) tells you at a glance what kind of change it is. A tool (commitlint) rejects messages that don't follow the format.

---

## 3. The big picture: how the pieces fit

```
                ┌──────────────────────────┐
  Browser  ───▶ │  web  (React app)        │   what the user sees
                └────────────┬─────────────┘
                             │  HTTP requests (+ live socket later)
                ┌────────────▼─────────────┐
                │  api  (Node + Express)   │   rules, security, logic
                └────────────┬─────────────┘
                             │
                ┌────────────▼─────────────┐
                │  MongoDB  (database)     │   where data is stored
                └──────────────────────────┘

        shared  (Zod schemas + types used by BOTH web and api)
```

The code lives in **one repository with several packages** (a "monorepo"):

| Folder            | What it is                                                                                                                                                     |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api`        | The backend server. Receives requests, checks permissions, talks to the database.                                                                              |
| `apps/web`        | The frontend. The React app that runs in the browser.                                                                                                          |
| `packages/shared` | Code both sides need, such as the rules for what a valid email or password looks like. Written once, used twice, so the browser and server can never disagree. |
| `e2e`             | (Later) Tests that click through the real app in a real browser.                                                                                               |

Inside the api, every feature follows the same **layers**:

```
route  →  controller  →  service  →  model
```

- **Route**: which URL and HTTP method, plus checks that run first (is the body valid? is the user logged in?).
- **Controller**: reads the request, calls the service, sends the response. No database code.
- **Service**: the actual business logic ("create a user", "rotate a token").
- **Model**: the shape of the data in the database.

Keeping these separate means each piece is small, has one job, and is easy to test.

---

## 4. Phase 0 — Setup and foundations (done)

**Goal:** before writing any features, set up a project where good habits are automatic: code is checked on every commit, the database runs with one command, and every pull request is tested by a robot.

### Slice 0.1 — Monorepo skeleton

**What we did:** created the three packages (`api`, `web`, `shared`) inside one repository, with shared TypeScript settings and root commands (`pnpm dev`, `pnpm test`, …) that run across all packages at once.

**Why:** one repository means one place to clone, one install, and changes that touch both frontend and backend land in one commit. The shared package removes duplicated validation code.

- **pnpm workspaces** link the packages together, so `web` and `api` can import `@taskboard/shared` as if it were an installed library.
- **TypeScript in strict mode** everywhere: it catches whole categories of bugs (like using a value that might be `undefined`) before the code ever runs.
- The api got one route, `GET /health`, to prove it starts. The web app got one placeholder page.

### Slice 0.2 — Quality tooling

**What we did:** added tools that check code automatically.

| Tool            | What it does                                                                        |
| --------------- | ----------------------------------------------------------------------------------- |
| **ESLint**      | Finds bugs and risky patterns (for example, forgetting to `await` a database call). |
| **Prettier**    | Formats code the same way every time, so nobody argues about spaces.                |
| **Husky**       | Runs scripts automatically when you `git commit`.                                   |
| **lint-staged** | Makes Husky check only the files you changed, so commits stay fast.                 |
| **commitlint**  | Rejects commit messages that don't follow the Conventional Commits format.          |

**Why:** mistakes are caught on your own machine in seconds, instead of in review or production.

### Slice 0.3 — Config, logging, Docker

**What we did:**

- **Validated settings** (`env.ts`): when the api starts, it checks every setting (database address, port, …) with Zod. If something is missing or wrong, it stops immediately with a clear message instead of failing in a confusing way later.
- **Logging with Pino**: structured, fast logs. Sensitive values (passwords, tokens, cookies) are automatically replaced with `[redacted]` so they never end up in log files.
- **MongoDB connection with graceful shutdown**: when the server is stopped, it finishes in-flight requests and closes the database connection cleanly.
- **`/health` reports the database status**: it returns `200 {"status":"ok","db":"connected"}` when healthy, or `503` when the database is down. Hosting platforms use this to know if the app is alive.
- **Docker Compose**: one command (`docker compose up`) starts MongoDB, the api and the web app. The database data is kept in a "volume" so it survives restarts.
- **Multi-stage Dockerfiles**: the first stage builds the code with all the build tools; the final image contains only what is needed to run. Smaller images, fewer security holes.

**Why:** anyone can run the whole system with one command, and production problems (bad config, leaked secrets in logs) are prevented by design.

### Slice 0.4 — Continuous Integration (CI)

**What we did:** added a GitHub Actions workflow. On every pull request and every push to `main`, GitHub starts a fresh machine, installs everything exactly as locked, then runs **lint → typecheck → test → build**.

**Why:** a pull request can't be merged with a red ❌. Problems are caught before they reach `main`, and "it works on my machine" stops being an excuse.

### Review and finish

After the four slices, the whole phase was reviewed and six issues were fixed (for example: the server now exits cleanly if its port is already in use, the database is only reachable from the local machine, and errors are logged in a format Pino understands). Pull request #1 passed CI and was merged.

---

## 5. Phase 1 — Authentication (done)

**Goal:** people can register, log in, stay logged in across page reloads, and log out — securely.

### Slice 1.1 — Plan the token strategy (done)

Before coding, we designed how login works. Here is the design in plain words.

#### Two tokens

When you log in, the server gives your browser two "tickets" (tokens):

|          | Access token                                                          | Refresh token                                        |
| -------- | --------------------------------------------------------------------- | ---------------------------------------------------- |
| Purpose  | Proves who you are on every request                                   | Gets you a new access token when the old one expires |
| Lifetime | 15 minutes                                                            | 7 days                                               |
| Format   | A signed **JWT** (the server can verify it without a database lookup) | A long random string (meaningless on its own)        |

**Why two?** A short-lived access token limits the damage if one is stolen — it stops working within 15 minutes. The refresh token lets you stay logged in for a week without typing your password again.

#### Stored in httpOnly cookies

Both tokens are stored in **cookies marked `httpOnly`**. JavaScript running in the page **cannot read** these cookies, so even if an attacker managed to inject a script into the page (an "XSS" attack), they could not steal the tokens. The browser sends the cookies to the server automatically.

The refresh cookie is also limited to the `/auth` path, so it is only ever sent to the login endpoints, not with every request.

#### Refresh rotation with reuse detection

Every time the refresh token is used, it is **thrown away and replaced with a new one** ("rotation"). The server remembers which tokens were already used.

If an **already-used** refresh token ever shows up again, something is wrong: two parties have a copy, which means it was probably stolen. The server then **cancels the whole login session** (all tokens in that chain), forcing both the thief and the real user to log in again. The real user just types their password; the thief is locked out.

**The two-tab problem:** if you have two browser tabs open, both may try to refresh at the same moment with the same token. That would look like theft. So there is a **10-second grace window**: reuse within 10 seconds is treated as a harmless race, not theft.

#### Where refresh tokens are stored

In a database collection, but only as a **hash** (a one-way fingerprint). If the database ever leaked, the attacker would get fingerprints, not usable tokens. Expired tokens are deleted automatically by MongoDB.

#### Cookie settings for local vs production

- **Locally**, the web app (`localhost:5173`) and api (`localhost:4000`) count as the same site, so cookies use `SameSite=Lax`.
- **In production**, the web app is hosted on Vercel and the api on Render — different sites. Cookies must then be `SameSite=None; Secure` to be sent at all. One known risk: Safari blocks such cross-site cookies. This will be solved in the deployment phase (likely with a custom domain), and the settings live in one function so it is a small change.

#### CSRF protection

**CSRF** is an attack where a malicious website tricks your browser into sending a request to our api, with your cookies attached. We block it by:

1. Checking the `Origin` header on every write request: it must be our own web app.
2. Only accepting JSON request bodies, which browsers won't send cross-site without permission.
3. Never changing data on `GET` requests.

### Slice 1.2 — Implement (done)

**What we built:**

| Endpoint              | What it does                                 |
| --------------------- | -------------------------------------------- |
| `POST /auth/register` | Creates an account and logs you in.          |
| `POST /auth/login`    | Checks email + password, sets the cookies.   |
| `POST /auth/refresh`  | Swaps the refresh token for a new pair.      |
| `POST /auth/logout`   | Cancels the session and clears the cookies.  |
| `GET /auth/me`        | Returns who you are (needs to be logged in). |

**Supporting pieces:**

- **Shared validation rules** (`registerSchema`, `loginSchema`) in the shared package, so the sign-up form and the server use identical rules. Passwords are 8–72 characters (bcrypt, the hashing tool, ignores anything past 72 bytes).
- **Passwords are hashed with bcrypt**, never stored as plain text, and never returned or logged.
- **Same error for unknown email and wrong password** ("Invalid email or password"), and the same response time, so an attacker can't discover which emails have accounts.
- **Typed errors**: the code throws named errors (`Unauthorized`, `Forbidden`, `Conflict`, …). One central error handler turns them into a consistent JSON response: `{ "error": { "code", "message", "details" } }`.
- **Security middleware**: Helmet (safe HTTP headers), CORS (only our web app may call the api with cookies), and rate limiting (max 10 login/register attempts per 15 minutes per IP, to slow down password guessing).
- **Log redaction** extended for the new sensitive fields (tokens, password hashes, cookies).
- **A decision record** (ADR 004) explaining the token strategy and the alternatives we rejected.

### Slice 1.3 — Tests (done)

**What we did:** wrote 28 automated tests that call the real api endpoints against a real (temporary) database and check the results.

They cover: successful and failed registration, duplicate emails, invalid input, login with right and wrong passwords, cookie security flags, rate limiting, token rotation, the grace window, theft detection (cancelling the whole session), expired and forged tokens, logout, `/me` with and without a login, and the CSRF origin check.

**How the test database works:** the tool `mongodb-memory-server` starts a throwaway MongoDB just for the test run. Each test file gets its own empty database, and data is wiped after every test. Nothing touches your real development data, and the tests run on GitHub's CI machines without any extra setup.

**Proving the tests work:** we deliberately broke the theft-detection code and confirmed that the matching test failed, then restored it. A test that can't fail is worthless.

### Review and finish

The whole phase was reviewed like a strict senior engineer would before a pull request. Fixes made:

- **Two-tab refresh:** the "already rotated" response now has its own error code (`REFRESH_TOKEN_ROTATED`), so the web app can tell it apart from a real logout and simply retry.
- **Race-condition tests:** two refreshes with the same token at the same moment — exactly one wins. Two sign-ups with the same email at the same moment — exactly one account is created.
- **Safer production config:** the api refuses to start in production if the web app's address (`CLIENT_URL`) is not set, instead of silently rejecting every request.
- **Safer error messages:** error messages from third-party libraries are only shown to users when the library marks them as safe.
- **A real bug caught by a new test:** an email typed or pasted with a space around it was rejected as invalid, because the format was checked before the spaces were removed. Now the email is cleaned first, then checked.

Two smaller items were written down for later phases (proxy settings on the hosting platform, and Safari cookies when running everything in Docker).

The full suite (61 tests) runs in about 6 seconds, and pull request #2 passed CI and was merged.

---

## 6. Phase 2 — Boards, lists and cards API (done)

**Goal:** the data behind every board (boards, lists, cards and a history of changes), reachable through the api, with each person's role on a board checked on every request.

### Slice 2.1 — Data model and permission checks (done)

**What we did:** defined the four kinds of data the app stores:

- **Board:** a title, a colour, and its **members**, each with a role.
- **List:** a column on a board ("To Do", "In Progress", …).
- **Card:** a task in a list, with a description, labels, people assigned, a due date and a checklist. Cards can be **archived** (hidden but kept).
- **Activity:** a log line for every change, such as "Priya moved a card", for the history shown in Phase 5.

**Roles:** every board member is a **viewer** (can only look), a **member** (can add and change lists and cards) or an **owner** (can also rename or delete the board). A single check, `requireBoardRole`, runs before every board request and answers "is this person allowed?".

**Two safety choices:**

- Someone who is **not on the board** gets "not found", not "forbidden". Otherwise anyone could learn which board ids exist by guessing.
- If a web address mixes ids from two boards (for example, my board's id with a card from someone else's board), the request is refused. This closes a classic trick for reaching data you shouldn't.

### Slice 2.2 — Boards and lists (done)

**What we did:** the endpoints to list your boards (with your role on each), create a board (it starts with three lists: To Do, In Progress, Done), open a board with all its lists and cards in one go, and rename or delete it. Lists can be added, renamed, moved and deleted.

**How ordering works:** each list and card has a **position** like `"a0"`, `"a1"`. To put something between `"a0"` and `"a1"`, it gets a position such as `"a0V"`, which sorts between them. Moving an item changes **only that item**, never its neighbours. This is called **fractional indexing**.

**Out-of-date screens:** if you drag a list while someone else already moved things around, your screen is out of date. The server notices (the neighbours you named are no longer next to each other) and answers "conflict, refresh" instead of putting the list somewhere you didn't mean.

### Slice 2.3 — Cards (done)

**What we did:** cards can be created, opened, edited (title, description, labels, assignees, due date, checklist), archived and restored, moved within or between lists, and deleted. Only board members can be assigned to a card.

**When two people drop a card in the same spot at the same moment:** both would get the same position. The database now **refuses duplicate positions**, and the server then retries with a random free position in the same gap. Both cards land where their users aimed.

**A bug found by a test:** the first retry version stepped up one position at a time. A test that creates five cards at once showed them colliding again and again in a line, until some gave up. Picking a random position for each retry fixed it.

### Slice 2.4 — Permission tests (done)

**What we did:** one test file tries every board request as an owner, a member, a viewer, a stranger and a logged-out visitor, and checks each answer against the table in `docs/permissions.md`. It also checks that **refused requests changed nothing**, and fails if the table and the tests ever disagree.

### Review and finish

The phase was reviewed before merging. Fixes made:

- **Cards with no list:** deleting a list removed the list before its cards. A crash in between, or a card added at that exact moment, could leave cards that pointed to a list that no longer existed, and the board would still show them. Now cards are deleted first, and a board only shows cards whose list exists.
- **Faster card queries:** some card lookups searched every card of every board instead of using the database index (like reading a whole book instead of the index at the back). They now use the index, which we confirmed with the database's own query report.
- **A clear error instead of a crash:** editing a card that someone else deleted at the same moment now answers "not found" instead of "something went wrong".
- **A bug caught by a new test:** activity entries with no details were saved without their details field at all, because the database library drops empty objects by default. That is now switched off for activity.
- **New tests** for the safety steps the design relies on, such as undoing a half-created board.

Two items were written down for later: limits on how many lists and cards a board can have (Phase 6), and sorting "My boards" by recent activity (Phase 3).

The full suite has about 240 tests.

---

## 7. Phases still to come

| Phase                                   | What it adds                                                                                                                                          |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **3 — Frontend board UI**               | Sign-in pages, "My boards" page, and the board screen with drag and drop. Moves update the screen instantly and roll back if the server rejects them. |
| **4 — Real-time sync and presence**     | Socket.IO: changes appear live for everyone on the board, plus "who's online" avatars.                                                                |
| **5 — Card details, comments, invites** | Card detail popup, comments, activity history, and inviting people by email with a role.                                                              |
| **6 — Testing and CI hardening**        | Frontend tests, an end-to-end browser test (Playwright), coverage reports, dependency security checks.                                                |
| **7 — Deploy and polish**               | Live on Render (api) + Vercel (web) + MongoDB Atlas, automatic deploys from `main`, demo data, README, loading and empty states.                      |

---

## 8. Every tool and package, and why

### Languages and runtime

| Tool                | What it is                  | Why we use it                                                                                                                                                                                    |
| ------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **TypeScript** (v6) | JavaScript with types       | Catches mistakes before running the code; the editor can autocomplete everything. Pinned to v6 because the linter doesn't support v7 yet (ADR 002).                                              |
| **Node.js 22**      | Runs JavaScript on a server | Same language on frontend and backend. v22 is a long-term-support release.                                                                                                                       |
| **pnpm**            | Package manager             | Faster and more disk-efficient than npm, with built-in monorepo ("workspace") support. It also refuses to run packages' install scripts unless you approve them — a supply-chain safety feature. |

### Backend (`apps/api`)

| Package                 | Why                                                                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Express 5**           | The most widely known Node web framework. Version 5 automatically catches errors from `async` code.                                                                                  |
| **Mongoose**            | Defines the shape of MongoDB data and talks to the database.                                                                                                                         |
| **Zod**                 | Validates input (request bodies, settings) and generates TypeScript types from the same rules.                                                                                       |
| **Pino**                | Very fast structured logging, with automatic redaction of secrets. `pino-pretty` makes logs readable during development.                                                             |
| **jose**                | Creates and verifies JWT access tokens. Modern, typed, no dependencies. Chosen over `jsonwebtoken`, which is older-style and needs separate type files.                              |
| **bcryptjs**            | Hashes passwords so they're never stored in plain text. Pure JavaScript, so no native compilation step. Chosen over `bcrypt`, which needs a compiler and an approved install script. |
| **cookie-parser**       | Reads cookies from incoming requests.                                                                                                                                                |
| **helmet**              | Adds security-related HTTP headers with one line.                                                                                                                                    |
| **cors**                | Allows only our web app's address to call the api with cookies.                                                                                                                      |
| **express-rate-limit**  | Limits how often one IP address can try to log in.                                                                                                                                   |
| **tsx**                 | Runs TypeScript directly in development and restarts on file changes.                                                                                                                |
| **fractional-indexing** | Creates sortable position strings, so a card can move between two others by changing only itself. Tiny, with no dependencies of its own.                                             |

### Frontend (`apps/web`)

| Package                                                                    | Why                                                                                               |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **React 18**                                                               | The most common UI library; component-based.                                                      |
| **Vite**                                                                   | Starts the dev server instantly and builds a small production bundle.                             |
| **Tailwind CSS**                                                           | Style elements with small utility classes directly in the markup; consistent spacing and colours. |
| _Planned:_ TanStack Query, Zustand, React Router, React Hook Form, dnd-kit | Server data caching, small UI state, page routing, forms, and drag and drop (see ADR 001).        |

### Testing

| Package                                      | Why                                                                                                                                                                                                                                     |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vitest**                                   | Fast test runner that understands TypeScript out of the box.                                                                                                                                                                            |
| **Supertest**                                | Sends real HTTP requests to the api inside tests, without starting a network server.                                                                                                                                                    |
| **mongodb-memory-server**                    | Starts a temporary real MongoDB for tests. Each run starts clean, and CI needs no database service. Its install script (which would download MongoDB on every install) is turned off; it downloads once, lazily, on the first test run. |
| _Planned:_ React Testing Library, Playwright | Testing components like a user would, and clicking through the real app in a browser.                                                                                                                                                   |

### Code quality

| Tool                               | Why                                                                                           |
| ---------------------------------- | --------------------------------------------------------------------------------------------- |
| **ESLint** + **typescript-eslint** | Finds bugs using type information, e.g. a forgotten `await` or treating unknown data as safe. |
| **Prettier**                       | Automatic consistent formatting.                                                              |
| **Husky** + **lint-staged**        | Checks and formats changed files on every commit.                                             |
| **commitlint**                     | Enforces the commit message format.                                                           |

### Infrastructure

| Tool                                     | Why                                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Docker** + **Docker Compose**          | Runs MongoDB (and optionally the whole app) identically on every machine with one command. |
| **GitHub Actions**                       | Runs lint, typecheck, tests and build on every pull request.                               |
| _Planned:_ Render, Vercel, MongoDB Atlas | Hosting for the api, the web app, and the database.                                        |

---

## 9. Decisions we wrote down (ADRs)

An **ADR** (Architecture Decision Record) is a short document that records an important choice: the problem, the decision, the alternatives, and the trade-offs. It answers "why did we do it this way?" long after everyone has forgotten.

| ADR | Decision                            | In one sentence                                                                                                                        |
| --- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 001 | TanStack Query + Zustand            | Server data is cached by TanStack Query; the tiny bit of pure UI state lives in Zustand — less boilerplate than Redux.                 |
| 002 | Pin TypeScript 6                    | The linter that catches async bugs doesn't support TypeScript 7 yet, so we wait.                                                       |
| 003 | Shared package from source in dev   | In development, tools read the shared package's TypeScript directly (instant changes); in production, Node reads the compiled version. |
| 004 | Auth token strategy                 | Short JWT access token + rotating random refresh token, both in httpOnly cookies, with theft detection.                                |
| 005 | Board members inside the board      | Each board stores its members and their roles itself; people who aren't members get "not found".                                       |
| 006 | No multi-step database transactions | Writes that touch several collections are ordered so a crash midway leaves nothing anyone can see or reach.                            |
| 007 | Unique positions with retry         | The database refuses two items in the same spot; the server retries at a random free spot nearby.                                      |

---

## 10. Glossary

| Term                    | Meaning                                                                                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **API**                 | The backend's set of URLs that the frontend calls to read or change data.                                                                          |
| **REST**                | A common style of API: URLs name things (`/boards/123`), HTTP methods say what to do (`GET` read, `POST` create, `PATCH` update, `DELETE` remove). |
| **Monorepo**            | One git repository containing several related packages.                                                                                            |
| **Middleware**          | A function that runs before the main handler, e.g. "is the user logged in?"                                                                        |
| **JWT**                 | JSON Web Token: a small signed message. The server can check it wasn't tampered with, without a database lookup.                                   |
| **Hash**                | A one-way fingerprint of some data. You can check a password against its hash, but you can't turn the hash back into the password.                 |
| **Cookie**              | A small value the browser stores and sends back to the server automatically.                                                                       |
| **httpOnly**            | A cookie flag that hides the cookie from JavaScript.                                                                                               |
| **SameSite**            | A cookie flag controlling whether the cookie is sent on requests coming from other websites.                                                       |
| **CORS**                | Browser rules for which websites may call an api.                                                                                                  |
| **CSRF**                | An attack that tricks your browser into sending a request you didn't intend.                                                                       |
| **XSS**                 | An attack that injects malicious script into a web page.                                                                                           |
| **Rate limiting**       | Capping how many requests someone can make in a time window.                                                                                       |
| **Lint**                | Automatic code checks for bugs and bad patterns.                                                                                                   |
| **Typecheck**           | Running the TypeScript compiler to find type errors without producing output.                                                                      |
| **CI**                  | Continuous Integration: automatic checks on every change pushed to GitHub.                                                                         |
| **Docker container**    | A lightweight, isolated box that runs a program the same way on every machine.                                                                     |
| **Pull request (PR)**   | A proposal to merge a branch into `main`, reviewed and checked before merging.                                                                     |
| **Fractional indexing** | Giving items sortable positions like `"a0"`, `"a0V"`, `"a1"` so an item can be placed between two others by changing only itself.                  |
| **Role (RBAC)**         | Role-based access control: what you may do depends on your role on the board (viewer, member or owner).                                            |
| **Database index**      | A sorted lookup table the database keeps so it can find matching records without reading every one.                                                |
| **Race condition**      | Two things happening at the same moment and getting in each other's way, such as two people dropping a card in the same spot.                      |
| **Optimistic update**   | Showing a change on screen immediately, before the server confirms it, and undoing it if the server says no.                                       |
