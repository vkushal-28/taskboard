# ADR 006: No multi-document transactions; order writes so a crash is harmless

- **Status:** Accepted
- **Date:** 2026-10-24

## Context

Some writes touch several collections: creating a board also creates its three starter lists, and deleting a board or list deletes its children. MongoDB only supports multi-document transactions on a replica set. Our tests use a standalone mongodb-memory-server, and Docker Compose runs a standalone `mongo`. Atlas (production) is a replica set.

## Decision

Do not use transactions. Order each multi-step write so that a crash midway leaves only unreachable or harmless data:

- **Create board:** create the board, then `insertMany` its lists. If the lists fail, delete the board and rethrow.
- **Delete board:** delete the board first, then its lists, cards and activity. Leftover children cannot be reached, because `requireBoardRole` finds no board.
- **Delete list:** delete the list, then its cards. Leftover cards point to a missing list and are not shown.
- **Activity:** logged after the main write and never fails the request (a lost activity row beats the client retrying a write that was saved).

## Alternatives considered

- **Transactions everywhere** — truly atomic, but needs `MongoMemoryReplSet` in tests and a single-node replica set in Docker (`--replSet` plus an init step). That is more setup and slower tests, for failures that need a crash in a window of a few milliseconds.
- **Transactions only in production** — two code paths, and the tested one is not the one that runs.
- **Soft deletes** (`deletedAt` instead of removing) — makes deletes single-document, but every query then needs a `deletedAt: null` filter, and data is never cleaned up.

## Consequences

- Good: simple setup; the same code runs in tests, Docker and production; each step is a single, fast write.
- Bad / tradeoffs: a crash between steps can leave orphan lists, cards or activity that take up space. A failed board create can, in theory, leave a board with no lists if the cleanup also fails.
- Follow-ups: if orphans ever matter, a periodic cleanup job can delete lists, cards and activity whose board no longer exists. Card moves (Slice 2.3) update one document, so they need no transaction at all.
