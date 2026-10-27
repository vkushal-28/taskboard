# ADR 008: Pin React Router 7 while the web app is on React 18

- **Status:** Accepted
- **Date:** 2026-10-27

## Context

The stack is React 18 (CLAUDE.md). `pnpm add react-router` installed React Router 8.5, whose peer dependencies require `react` and `react-dom` 19.2.7 or newer. pnpm installed it anyway and only warned, so the mismatch would have surfaced later as runtime or type errors instead of at install time. We only use the library's basic routing: `createBrowserRouter`, nested layout routes, `Navigate`, `useSearchParams`, `useParams` and `NavLink`.

## Decision

Pin `react-router@^7` (7.18 today), the newest major that supports React 18. `pnpm peers check` must report no issues.

## Alternatives considered

- **Upgrade to React 19 and React Router 8.** This is the long-term path, but it changes the stack the plan is built on, in the middle of a phase. It also needs every other React dependency (TanStack Query, React Hook Form, dnd-kit, Testing Library) re-checked against React 19.
- **Install React Router 8 and ignore the peer warning.** That would mean running a library against a React version it doesn't support, with nothing to show when that causes problems.
- **TanStack Router.** It has typed routes, but it adds an unfamiliar API for no benefit at this app's size, and the plan and CLAUDE.md name React Router.

## Consequences

- Good: every dependency's peer requirements are met. The routing code doesn't use any 7-only API, so the later upgrade is mostly a version bump.
- Bad / tradeoffs: we're one major version behind and miss 8's changes until the React 19 upgrade.
- Follow-ups: upgrade React and React Router together, probably after Phase 7 when the app is deployed and covered by e2e tests. Check `pnpm peers check` after every `pnpm add`.
