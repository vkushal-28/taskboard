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

A move whose target `listId` is on another board is rejected by the cards service (Slice 2.3), not by the middleware, because the target is in the body, not the url.

Phase 5 adds invites, member role changes and member removal (owner only) to this table.
