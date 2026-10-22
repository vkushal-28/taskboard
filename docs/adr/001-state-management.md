# ADR 001: TanStack Query for server state, Zustand for UI state

- **Status:** Accepted
- **Date:** 2026-10-22

## Context

Almost all Taskboard data (boards, lists, cards, comments, activity) lives on the server and changes in real time. The hard problems are caching, optimistic updates, rollback and applying Socket.IO events. Client-only state is small: presence, open modals, filters.

## Decision

Use TanStack Query for all server state and Zustand for the small amount of UI state.

## Alternatives considered

- **Redux Toolkit + RTK Query** — strong DevTools and enforced structure, but more boilerplate and clunkier optimistic updates for a project this size.
- **React Context only** — re-render issues and no caching.

## Consequences

- Good: little boilerplate; optimistic moves with rollback are straightforward; socket events update the query cache directly.
- Tradeoff: two libraries to learn; must keep API data out of Zustand.
