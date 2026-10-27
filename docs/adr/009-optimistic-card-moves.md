# ADR 009: Optimistic card moves with snapshot rollback

- **Status:** Accepted
- **Date:** 2026-10-27

## Context

Dragging a card has to feel instant, but the server decides the final position (ADR 007) and can reject a move: 409 when the user's view is stale, 403 for a viewer, or a network failure. Phase 4 will also change the same board cache from socket events, so the approach must leave room for updates that don't come from this tab.

## Decision

`useMoveCard` updates the TanStack Query cache optimistically:

1. **`onMutate`:** cancel any board fetch in flight (a stale response must not overwrite the move), save a snapshot of the board, and write the moved card with a local position that `generateKeyBetween` computes from its new neighbours.
2. **`onSuccess`:** replace the card with the server's copy, which carries the real position. No refetch.
3. **`onError`:** restore the snapshot, show a toast (the server's message on a 409), and refetch the board.

While the user drags, `BoardCanvas` works on a local copy of the columns and leaves the cache alone. After the drop it keeps showing that copy until the optimistic write reaches the cache. Otherwise, during the `await` in `onMutate`, the board draws the old cache for a frame and the drop animation flies to the card's old list.

## Alternatives considered

- **Wait for the server, then update.** It's simple and always correct, but every drop waits a network round trip, and the card snaps back to its old place until the response arrives.
- **Optimistic update, then always refetch the board.** It's always in sync, but every move downloads the whole board (lists and cards), and a refetch that finishes before the server has applied a second, quicker move shows that move undone.
- **Keep the order only in local component state.** That would split server state across two places, which CLAUDE.md rules out.

## Consequences

- Good: drops are instant. A successful move costs one request and no refetch. A failed one rolls back visibly and explains why.
- Bad / tradeoffs: the snapshot is the whole board as it was before this move. If two moves are in flight and the first fails, its rollback also undoes the second on screen until the refetch arrives. We accept that because the refetch follows straight away. The optimistic position can differ from the server's, but that only matters until `onSuccess` swaps in the server copy.
- Follow-ups: in Phase 4, cache writes from socket events must be idempotent and skip events whose `actorId` is the current user. Creates already skip ids that are in the cache.
