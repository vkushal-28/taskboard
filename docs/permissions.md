# Permission matrix

The spec for `requireBoardRole(minRole)` and the Slice 2.4 RBAC tests. Role rank: viewer < member < owner.

Every board-scoped route needs a signed-in user first:

- **No access cookie:** 401 `UNAUTHORIZED`
- **Not a member of the board** (or the board, list or card does not exist): 404 `NOT_FOUND`, so board ids do not leak (ADR 005)
- **Member below the route's min role:** 403 `FORBIDDEN`

| Endpoint                      | Min role  | owner | member | viewer |
| ----------------------------- | --------- | ----- | ------ | ------ |
| `GET /boards`                 | signed in | ✓     | ✓      | ✓      |
| `POST /boards`                | signed in | ✓     | ✓      | ✓      |
| `GET /boards/:boardId`        | viewer    | ✓     | ✓      | ✓      |
| `PATCH /boards/:boardId`      | owner     | ✓     | 403    | 403    |
| `DELETE /boards/:boardId`     | owner     | ✓     | 403    | 403    |
| `POST /boards/:boardId/lists` | member    | ✓     | ✓      | 403    |
| `PATCH /lists/:listId`        | member    | ✓     | ✓      | 403    |
| `PATCH /lists/:listId/move`   | member    | ✓     | ✓      | 403    |
| `DELETE /lists/:listId`       | member    | ✓     | ✓      | 403    |
| `POST /lists/:listId/cards`   | member    | ✓     | ✓      | 403    |
| `GET /cards/:cardId`          | viewer    | ✓     | ✓      | ✓      |
| `PATCH /cards/:cardId`        | member    | ✓     | ✓      | 403    |
| `PATCH /cards/:cardId/move`   | member    | ✓     | ✓      | 403    |
| `DELETE /cards/:cardId`       | member    | ✓     | ✓      | 403    |

`GET /boards` and `POST /boards` are not board-scoped: they only need `requireAuth`. `GET /boards` returns only boards the user is a member of.

Archiving and restoring a card is `PATCH /cards/:cardId` with `{ archived }`, so it needs member like any other card edit.

A move whose target `listId` is on another board is rejected by the cards service with 409 (Slice 2.3), not by the middleware, because the target is in the body, not the url.

Phase 5 adds invites, member role changes and member removal (owner only) to this table.

## Socket events (Phase 4)

Sockets are read-only. Every write goes through REST and the routes above; the service broadcasts the result to the board room only after the DB write succeeds.

- **Handshake:** needs a valid `tb_access` cookie, otherwise `connect_error` with `data.code = 'UNAUTHORIZED'`. A handshake whose `Origin` is not `CLIENT_URL` is refused (ADR 010).
- **`board:join { boardId }`:** any role (viewer and up) joins the room `board:<id>`, and the reply is `{ ok: true, role }`. A non-member or a missing board gets `{ ok: false, error: { code: 'NOT_FOUND' } }`, the same rule as REST (ADR 005). A malformed id gets `VALIDATION_ERROR`.
- **`board:leave { boardId }`:** leaves the room. No reply.
- **`presence:update { boardId, userIds }`** (server to room): sent after every join, leave and disconnect. Each online user appears once (ADR 012).
- **`card:drag { boardId, cardId | null }`** (client): member or owner only, and only from a socket that joined that board. A viewer's or outsider's drag is silently ignored. It is relayed to the rest of the room as **`card:dragging { boardId, userId, cardId | null }`** and never saved. A disconnect mid-drag sends `cardId: null`.
- **Board events** (`card:*`, `list:*`, `board:updated`, `board:deleted`): sent to everyone in the room, including the actor's own sockets. Each payload carries `boardId` and `actorId`. Schemas are in `packages/shared/src/realtime.ts`.

Membership is checked when a socket joins, not on every event. Phase 5 must remove a member's sockets from the room when they are removed from the board (ADR 010).
