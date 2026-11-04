# ADR 017: E2E tests run against their own servers and database

- **Status:** Accepted
- **Date:** 2026-11-04

## Context

Slice 6.2 adds one Playwright test that drives the real app: sign in, create a board, add a list and a card, drag the card, reload. It needs a running api, a running web app and a MongoDB with the seeded demo user.

On a developer machine those usually exist already: `pnpm dev` serves the api on 4000 and the web app on 5173, against the `taskboard` database that holds the developer's own boards. The user also keeps `pnpm dev` running in their own terminal, and a stale Docker api on port 4000 has caused confusing failures before (the "port 4000 gotcha"). CI has no `.env` file and no running servers.

## Decision

Playwright starts its own api and web app for every run, isolated from development:

1. **Own ports:** api on **4100**, web on **5174** (`webServer` in `e2e/playwright.config.ts`, `--strictPort` for Vite).
2. **Own database:** `taskboard-e2e` (overridable with `E2E_MONGODB_URI`). The global setup runs the idempotent demo seed against it.
3. **Own settings, passed as environment variables:** `PORT`, `MONGODB_URI`, `CLIENT_URL`, `VITE_API_URL` and an e2e-only `JWT_ACCESS_SECRET`. Process variables take priority over the root `.env` for both Node's `--env-file` and Vite, so the suite needs no `.env` at all.
4. **No shared state between runs:** the test names its board `E2E <timestamp>` and deletes it afterwards.
5. **Servers:** reused locally if something already listens on 4100/5174 (fast reruns), always fresh in CI (`reuseExistingServer: !CI`).

## Alternatives considered

- **Reuse the developer's `pnpm dev`:** no startup cost, but the test writes boards into the developer's data, fails when nothing is running, and silently tests a stale server when an old process holds port 4000.
- **Run the Docker Compose stack:** closest to production, but building the images adds minutes to every run (CI budget is 8 minutes), and the compose stack also uses port 4000.
- **Mock the api (Playwright route interception):** fast and needs no database, but then the test no longer proves that a moved card is saved, which is the point of the reload assertion.

## Consequences

- Good: a run never touches development data or collides with `pnpm dev`, and it behaves the same locally and in CI.
- Good: no secrets or `.env` needed in CI; the e2e secret signs only throwaway sessions.
- Bad: each run starts two servers (a few seconds), and the `taskboard-e2e` database keeps the seeded users between runs (harmless; the seed resets their passwords).
- Bad: a server left running on 4100/5174 is reused locally. If it runs old code, restart it.
- Follow-ups: more e2e tests should follow the same rule: unique names, and clean up what they create.
