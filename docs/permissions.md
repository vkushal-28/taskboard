# Permission matrix

The spec for `requireBoardRole(minRole)` and the Slice 2.4 RBAC tests. Role rank: viewer < member < owner.

Every board-scoped route needs a signed-in user first:

- **No access cookie:** 401 `UNAUTHORIZED`
- **Not a member of the board** (or the board, list or card does not exist): 404 `NOT_FOUND`, so board ids do not leak (ADR 005)
- **Member below the route's min role:** 403 `FORBIDDEN`

| Endpoint                                         | Min role  | owner | member | viewer |
| ------------------------------------------------ | --------- | ----- | ------ | ------ |
| `GET /boards`                                    | signed in | ✓     | ✓      | ✓      |
| `POST /boards`                                   | signed in | ✓     | ✓      | ✓      |
| `GET /boards/:boardId`                           | viewer    | ✓     | ✓      | ✓      |
| `PATCH /boards/:boardId`                         | owner     | ✓     | 403    | 403    |
| `DELETE /boards/:boardId`                        | owner     | ✓     | 403    | 403    |
| `POST /boards/:boardId/lists`                    | member    | ✓     | ✓      | 403    |
| `PATCH /lists/:listId`                           | member    | ✓     | ✓      | 403    |
| `PATCH /lists/:listId/move`                      | member    | ✓     | ✓      | 403    |
| `DELETE /lists/:listId`                          | member    | ✓     | ✓      | 403    |
| `POST /lists/:listId/cards`                      | member    | ✓     | ✓      | 403    |
| `GET /cards/:cardId`                             | viewer    | ✓     | ✓      | ✓      |
| `PATCH /cards/:cardId`                           | member    | ✓     | ✓      | 403    |
| `PATCH /cards/:cardId/move`                      | member    | ✓     | ✓      | 403    |
| `DELETE /cards/:cardId`                          | member    | ✓     | ✓      | 403    |
| `POST /cards/:cardId/checklist`                  | member    | ✓     | ✓      | 403    |
| `PATCH /cards/:cardId/checklist/:itemId`         | member    | ✓     | ✓      | 403    |
| `DELETE /cards/:cardId/checklist/:itemId`        | member    | ✓     | ✓      | 403    |
| `GET /cards/:cardId/comments`                    | viewer    | ✓     | ✓      | ✓      |
| `POST /cards/:cardId/comments`                   | member    | ✓     | ✓      | 403    |
| `GET /boards/:boardId/activity`                  | viewer    | ✓     | ✓      | ✓      |
| `GET /cards/:cardId/activity`                    | viewer    | ✓     | ✓      | ✓      |
| `GET /boards/:boardId/invites`                   | owner     | ✓     | 403    | 403    |
| `POST /boards/:boardId/invites`                  | owner     | ✓     | 403    | 403    |
| `POST /boards/:boardId/invites/:inviteId/resend` | owner     | ✓     | 403    | 403    |
| `DELETE /boards/:boardId/invites/:inviteId`      | owner     | ✓     | 403    | 403    |
| `PATCH /boards/:boardId/members/:userId`         | owner     | ✓     | 403    | 403    |
| `DELETE /boards/:boardId/members/:userId`        | owner     | ✓     | 403    | 403    |

`GET /boards` and `POST /boards` are not board-scoped: they only need `requireAuth`. `GET /boards` returns only boards the user is a member of.

Archiving and restoring a card is `PATCH /cards/:cardId` with `{ archived }`, so it needs member like any other card edit.

Checklist items are written one at a time through the `checklist` routes, so two people ticking different items at once never overwrite each other (ADR 013). `PATCH /cards/:cardId` still accepts a whole `checklist`, but the web app doesn't use it. A malformed `itemId` gets 404, like a missing one. Every card write also increments the card's `version`, and clients keep the copy with the highest one.

Viewers can read comments and activity but can't comment. A new comment also bumps the card's `commentCount` and `version`, so it broadcasts both `comment:created` and `card:updated`. The feeds are newest first, and `?cursor=<id of the last item>` fetches the next page (ADR 014).

A move whose target `listId` is on another board is rejected by the cards service with 409 (Slice 2.3), not by the middleware, because the target is in the body, not the url.

Invites, role changes and removals are owner only. A board always keeps at least one owner: demoting or removing the last one gets 409 `LAST_OWNER`, checked inside the same atomic update (ADR 015).

**Invite links** (`GET /invites/:token`, `POST /invites/:token/accept`) aren't board-scoped: they need a signed-in user whose email matches the invite, otherwise 403 `INVITE_WRONG_ACCOUNT`. An unknown token gets 404 `INVITE_NOT_FOUND`; a revoked, used or expired one gets 410 `INVITE_REVOKED`, `INVITE_USED` or `INVITE_EXPIRED`. An invite grants `member` or `viewer`, never `owner`.

**Socket tickets** (`POST /realtime/ticket`) aren't board-scoped either: any signed-in user gets a single-use ticket for their own session (30 s, at most 30 a minute), and a write from a foreign `Origin` gets 403 like every write. The ticket only opens a socket; board access is still checked by `board:join` (ADR 018).

Creating and resending invites send email, so together they're limited to 20 per user per 15 minutes (429 `TOO_MANY_REQUESTS`).

## Socket events (Phase 4)

Sockets are read-only. Every write goes through REST and the routes above; the service broadcasts the result to the board room only after the DB write succeeds.

- **Handshake:** needs a valid `tb_access` cookie, otherwise `connect_error` with `data.code = 'UNAUTHORIZED'`. A handshake whose `Origin` is not `CLIENT_URL` is refused (ADR 010).
- **`board:join { boardId }`:** any role (viewer and up) joins the room `board:<id>`, and the reply is `{ ok: true, role }`. A non-member or a missing board gets `{ ok: false, error: { code: 'NOT_FOUND' } }`, the same rule as REST (ADR 005). A malformed id gets `VALIDATION_ERROR`.
- **`board:leave { boardId }`:** leaves the room. No reply.
- **`presence:update { boardId, userIds }`** (server to room): sent after every join, leave and disconnect. Each online user appears once (ADR 012).
- **`card:drag { boardId, cardId | null }`** (client): member or owner only, and only from a socket that joined that board. A viewer's or outsider's drag is silently ignored. It is relayed to the rest of the room as **`card:dragging { boardId, userId, cardId | null }`** and never saved. A disconnect mid-drag sends `cardId: null`.
- **Board events** (`card:*`, `list:*`, `board:updated`, `board:deleted`): sent to everyone in the room, including the actor's own sockets. Each payload carries `boardId` and `actorId`. Schemas are in `packages/shared/src/realtime.ts`.

**Rate limit:** each socket may send 20 messages per second (`SOCKET_MESSAGE_LIMIT`); the excess is dropped, and a dropped `board:join` gets no reply.

Membership is checked when a socket joins, not on every event. A role change updates the role on the user's open sockets, and a removal takes their sockets out of the room right after the `members:updated` broadcast, so they hear that they were removed and nothing after it (ADR 010).

- **`members:updated { boardId, actorId, members }`** (server to room): after an invite is accepted, a role changes or a member is removed.
