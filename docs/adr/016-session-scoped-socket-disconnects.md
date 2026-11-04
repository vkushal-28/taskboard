# ADR 016: Disconnect a session's sockets when the session is revoked

- **Status:** Accepted
- **Date:** 2026-11-04

## Context

ADR 010 authenticates a socket once, at the handshake, and accepted that "a user whose session ends (logout, refresh reuse detected) keeps receiving events on an already-open socket until it disconnects". Phase 5 closed the membership half of that gap (`syncMemberSockets`), but not the session half:

- **Logout:** the tab that signs out closes its own socket, but other tabs of the same browser keep their live feed, and only notice the session is gone on their next request.
- **Refresh reuse detection** (ADR 004) is the case that matters. It means a refresh token was stolen. We revoke the whole refresh family, but a socket the attacker already opened with that family's access token keeps receiving every event of the victim's boards.

Both paths go through one function, `revokeFamily()`.

## Decision

Tie every socket to the session (refresh family) that opened it, and disconnect those sockets when the session is revoked.

1. Access tokens carry a `sid` claim with the refresh family id. A token without one is invalid (REST and handshake).
2. On connection, a socket joins the server-only room `session:<sid>`.
3. `revokeFamily()` calls `disconnectSession(familyId)` after its DB write, which runs `io.in('session:<sid>').disconnectSockets(true)`. Like `emitToBoard`, it never throws.
4. The web client treats the `io server disconnect` reason as "the session may be gone": it calls `recoverSession()`, which signs the tab out if the refresh fails, or reconnects if it succeeds.

Expiry-based disconnects stay out, for the reason ADR 010 gives (every user would reconnect every 15 minutes).

## Alternatives considered

- **A per-user room (`user:<id>`)**, disconnected on logout and on reuse. No token change, but signing out on one device would also cut the live view on every other device of that user until they reconnect.
- **`fetchSockets()` and filter by user**, like `syncMemberSockets`. Works on one instance, but with a multi-instance adapter it returns copies (ADR 015). `disconnectSockets` on a room goes through the adapter, so it already works across instances.
- **Disconnect at token expiry** (ADR 010's rejected option). Still too disruptive for a gap this decision closes more precisely.

## Consequences

- Good: a revoked session loses its live feed at once, including a thief's. Other tabs of a signed-out browser go to the sign-in page right away. Other sessions of the same user are untouched.
- Bad / tradeoffs: the access token grows by one claim, and the family id is visible to anyone who holds the token (it is random and grants nothing on its own). Tokens issued before this change are rejected; nothing was deployed yet, so no one is signed out by it.
- Follow-ups: a password change or "sign out everywhere" (not built) would revoke every family of the user and should call `disconnectSession` for each.
