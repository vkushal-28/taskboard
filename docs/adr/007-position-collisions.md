# ADR 007: Unique positions with randomised retry

- **Status:** Accepted
- **Date:** 2026-10-24

## Context

Lists and cards are ordered by a fractional-index string `position`, so a move or insert writes one document: the new key sorts strictly between its two neighbours. Two writes that target the same gap at the same moment compute the **same** key, because the key depends only on the neighbours. The same happens when an archived card, which the client cannot see, already holds the key the server computes. Equal positions make the order depend on a tie-break and hide the fact that two writes raced.

## Decision

- **Unique index** on `{ boardId, position }` for lists and `{ boardId, listId, position }` for cards. Duplicate positions become impossible, not just unlikely.
- **`writeAtPosition(before, after, write)`** computes the key and writes. On a duplicate-key error (E11000) it retries with a key that is above the colliding key and still below `after`. Each retry picks **one of 10 keys at random**, so writers that collided spread out instead of colliding again one key higher. After 5 attempts it returns 409.
- **Stale views return 409:** a neighbour that is missing or in another list, a target list on another board, or a visible item between the neighbours. Archived cards are ignored by this check because the client cannot see them.

## Alternatives considered

- **Ties broken by `_id`** (no unique index) — simple, and the order is still stable, but two cards can share a key forever, and the next insert between them has no gap to use.
- **Random jitter on every key** — avoids most collisions up front, but keys are longer from the start and duplicates are still possible without an index.
- **Retry one key higher each time** — this was the first version. A test with 5 concurrent creates showed the writers colliding again and again in a line, and the last ones gave up with 409.
- **Integer positions with renumbering** — readable, but a move rewrites every card after it, which breaks "a move updates one document" and multiplies socket events in Phase 4.

## Consequences

- Good: one document per move; no duplicates; concurrent writers in the same gap all succeed and land where their users aimed.
- Bad / tradeoffs: retry order is random, so two cards dropped into the same gap at once can come out in either order (acceptable: they were simultaneous). Keys grow about one character each time a gap is split; there is no rebalancing job. The stale-gap check and the write are not atomic, so two racing moves can both pass the check; the unique index still keeps their positions distinct.
- Follow-ups: a dev database created before this change has the old non-unique index. Drop the `cards` and `lists` position indexes (or the collections) once so Mongoose can create the unique ones.
