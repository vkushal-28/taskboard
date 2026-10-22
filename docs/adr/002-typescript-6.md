# ADR 002: Pin TypeScript 6 until typescript-eslint supports TypeScript 7

- **Status:** Accepted
- **Date:** 2026-10-22

## Context

pnpm installed TypeScript 7.0 (the native compiler) by default. We want type-checked linting (`recommendedTypeChecked`) because `no-floating-promises` and `no-misused-promises` catch missing `await`s in Express handlers and Mongoose calls. typescript-eslint 8.72 refuses to run with TypeScript 7.0: it still needs the TypeScript 6 compiler API.

## Decision

Pin the workspace to `typescript@^6` so one compiler serves `tsc`, the editor and typescript-eslint.

## Alternatives considered

- **TypeScript 7 for `tsc`, TypeScript 6 side by side for linting** — faster typechecks, but two compilers can disagree on types and the setup is harder to explain. The speed gain is negligible at this codebase size.
- **Drop type-checked linting** — loses the async-safety rules, which matter most for this stack.

## Consequences

- Good: every tool (typescript-eslint, Vite, Vitest, editors) supports TypeScript 6; one source of truth for types.
- Tradeoff: slower compiler than TypeScript 7.
- Follow-ups: upgrade to TypeScript 7 once typescript-eslint supports it (tracking: https://github.com/typescript-eslint/typescript-eslint/issues/10940).
