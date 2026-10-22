# ADR 003: Consume `@taskboard/shared` from source in dev, from `dist` in production

- **Status:** Accepted
- **Date:** 2026-10-22

## Context

`packages/shared` holds Zod schemas and types used by both apps. tsx, Vite and Vitest can import TypeScript directly, but the production api runs `node dist/server.js`, and Node cannot load `.ts` files from a dependency. We want shared changes to show up instantly in dev without a watch build, and a plain compiled package in production.

## Decision

`shared` is compiled with `tsc` to `dist` and exports a custom `"source"` condition pointing at `src/index.ts`, with `"default"` pointing at `dist/index.js`. Every dev tool opts into `"source"`: `customConditions` in `tsconfig.base.json`, `tsx --conditions=source`, `ssr.resolve.conditions` in the api Vitest config and `resolve.conditions` in the web Vite config. Plain Node ignores the unknown condition and loads `dist`.

## Alternatives considered

- **Bundle the api with tsup (or esbuild)** — inlines `shared` at build time with one tool, but adds a dependency (tsup is in maintenance mode) and bundles server code that runs fine unbundled.
- **Build `shared` in watch mode during dev** — no custom condition, but a second watcher process and stale-`dist` bugs.
- **Run the api with tsx in production** — slower startup and a dev tool in the runtime image.

## Consequences

- Good: no build step or watcher in dev; production runs compiled JavaScript with no dev tooling; no new dependency.
- Tradeoff: the condition must be configured in four places; a tool that misses it silently falls back to `dist` (or fails if `dist` is absent).
- Follow-ups: `pnpm -r build` builds `shared` before the api (topological order); Dockerfiles build with `--filter @taskboard/api...`.
