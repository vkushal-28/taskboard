# ADR 010: Socket authentication with the access cookie and an Origin check

- **Status:** Accepted; the cookie handshake (decision 1) is superseded by ADR 018 (socket tickets)
- **Date:** 2026-11-03

## Context

Phase 4 adds Socket.IO so that people on the same board see each other's changes. The REST api already authenticates with a 15-minute access token in an httpOnly cookie (ADR 004) and checks board membership on every request (ADR 005). Sockets need the same guarantees: only signed-in users connect, and only members receive a board's events.

Two things are different for sockets:

- **CORS doesn't protect WebSockets.** The browser sends no preflight for a WebSocket upgrade and attaches our cookie to it. In production the cookie is `SameSite=None`, so any site could open a socket as the visiting user (cross-site WebSocket hijacking) and read their boards' events.
- **A connection is long-lived.** Auth happens once at the handshake, and the socket can stay open long after the access token that opened it has expired.

## Decision

1. **Handshake auth from the cookie:** an `io.use` middleware reads `tb_access` (the REST app's cookie-parser runs on the handshake through `io.engine.use`) and checks it with `verifyAccessToken`. Failure is a `connect_error` with `data.code = 'UNAUTHORIZED'`, and the client refreshes the session and reconnects.
2. **Origin check:** `allowRequest` refuses any handshake whose `Origin` is not `CLIENT_URL`, the same rule `requireSameOrigin` applies to REST writes. No Origin means a non-browser client, which has no victim's cookie to borrow.
3. **Membership at join:** `board:join` calls `findMemberRole` and only then adds the socket to `board:<id>`. Non-members get `NOT_FOUND` (ADR 005). Sockets never write to the DB.
4. **No re-auth after the token expires:** a connected socket keeps its rooms until it disconnects. We accept that for now (see Consequences).

## Alternatives considered

- **Disconnect each socket when its access token expires** (a timer set from the token's `exp`), so the client refreshes and reconnects. This is the strictest option, but every user reconnects every 15 minutes, which means a refetch on each reconnect (Slice 4.2) and a visible blip in presence (Slice 4.3). Today it only closes a gap that nothing can open yet (see below).
- **Re-check membership on every emit.** That costs a DB query per socket per event, for the same gap.
- **Send the token in the Socket.IO `auth` payload instead of the cookie.** The token would have to be readable by JavaScript, which undoes the httpOnly design of ADR 004.
- **Rely on CORS only.** Not enough, because CORS doesn't cover the WebSocket upgrade (see Context).

## Consequences

- Good: one auth mechanism (the cookie) for REST and sockets, no token in JavaScript, and cross-site hijacking blocked at the handshake. Events only reach sockets that passed a membership check.
- Bad / tradeoffs: a user whose session ends (logout, refresh reuse detected) keeps receiving events on an already-open socket until it disconnects. They only receive data from boards they were a member of when they joined, which they could already read. **Superseded by ADR 016:** revoking a session now disconnects its sockets.
- Follow-ups:
  - **Phase 5 (member removal and role changes):** remove the user's sockets from `board:<id>` when they are removed from a board (`io.in(room).fetchSockets()` and filter by `socket.data.userId`). Logout can do the same for all of a user's sockets.
  - Revisit expiry-based disconnects if sockets ever accept writes, or if events start carrying data a user could not already read.
  - Phase 7: Socket.IO CORS must allow the Vercel origin, and Render must support WebSocket upgrades.
