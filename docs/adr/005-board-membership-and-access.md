# ADR 005: Board members embedded in the board, non-members get 404

- **Status:** Accepted
- **Date:** 2026-10-24

## Context

Every board-scoped request needs "what is this user's role on this board?". Roles are viewer, member and owner, a board can have several owners (Phase 5: "cannot remove the last owner"), and boards have a handful of members, not thousands. Routes name a board directly (`:boardId`) or through a list or card (`:listId`, `:cardId`).

## Decision

- Store members as an array inside the board: `members: [{ userId, role }]`, indexed on `members.userId`. Owners are members with role `owner`; there is no separate `ownerId`.
- `requireBoardRole(minRole)` resolves the board from `:boardId`, `:listId` or `:cardId` (one extra lookup for list and card), reads the role with a positional projection (`members.$`), and sets `req.boardId` and `req.boardRole`. If the url names more than one id and they point to different boards, it returns 404.
- A user who is not a member gets **404**, the same as an unknown or malformed id. A member whose role is too low gets **403**.

## Alternatives considered

- **Separate `Membership` collection** (`{ boardId, userId, role }`, unique on the pair) — scales to large boards and makes "boards for user" a plain index lookup, but every board read needs a second query, and removing a board needs a cascade. Worth it at hundreds of members per board, not here.
- **`ownerId` field plus `members` for everyone else** — two places to check, and it cannot express several owners without drifting out of sync.
- **403 for non-members** — clearer for debugging, but tells anyone with a guessed id that the board exists. GitHub returns 404 for private repos for the same reason.
- **Trusting `:boardId` when the url also has a card id** — saves a lookup, but lets a member of board A reach board B's card through `/boards/A/cards/<B's card>`.

## Consequences

- Good: one read answers the role question; one place holds roles; board ids do not leak; mismatched urls cannot cross boards.
- Bad / tradeoffs: a board document grows with its member list (fine below ~1000 members, far beyond our use); a 404 for a non-member is harder to debug than a 403; list and card routes cost one extra indexed lookup.
- Follow-ups: Phase 5 member changes must keep at least one owner. If Phase 4 socket joins need the same check, reuse `findMemberRole` from `modules/boards/access.ts`.
