# ADR 011: Clients apply every board event, including their own

- **Status:** Accepted
- **Date:** 2026-11-03

## Context

Services broadcast every successful write to the board room (ADR 010), and the room includes the sockets of the user who made the write. That user's tab has already applied the change: optimistically for card moves (ADR 009), from the REST response for creates.

The plan said to ignore events whose `actorId` is the current user. But one user can have the same board open in two tabs or on two devices. If events are filtered by user, those other tabs never see the user's own changes until they reload.

## Decision

The client applies every event, its own included. Every cache write is idempotent: creates use `appendIfMissing`, updates and moves replace the item with the server's copy, and deletes filter it out (`features/board/live-events.ts`). Applying an event twice, or after the REST response, leaves the same board.

The one unsafe case is a card move that is still in flight. While a move of card X is pending, `useBoardSocket` skips events about X:

- If the event comes from the current user, it is the echo of this move. It is skipped, because the response carries the same card.
- If someone else made it, it is skipped and the board is refetched once every move on the board has settled. Applying it now would undo the optimistic state, and the move's response would then overwrite their newer change.

## Alternatives considered

- **Skip events by `actorId`** (the original plan): this is simple, but a user's other tabs go stale.
- **Exclude only the sending tab on the server:** the client sends its socket id with each write (an `X-Socket-Id` header) and the service emits with `io.to(room).except(socketId)`. That's exact, but every controller and service has to pass the id through, and the client still needs idempotent writes for refetches and reconnects.
- **Always refetch the board on any event:** this is always correct, but costs one full board request per change for everyone in the room.

## Consequences

- Good: the user's other tabs and devices stay in sync, with no api change. The same idempotent cache writes also make reconnects and refetches safe.
- Bad / tradeoffs: the acting tab does a little redundant work on each of its own writes. A remote change to a card we are moving costs one board refetch.
- Follow-ups: when Phase 5 adds card edits from the modal, keep its mutations idempotent too, and decide whether they need the same in-flight guard as moves.
