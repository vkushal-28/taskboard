# ADR 020: Keep the session in sync across tabs with BroadcastChannel

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

Every tab of a browser shares the auth cookies, but each tab has its own TanStack Query cache.
The live Playwright walkthrough found that signing out in one tab left the other tabs showing
the old user's boards until they made a request that failed. Signing in as someone else in one
tab left the other tabs showing the previous person's data.

Board pages already hear about a revoked session from their socket (ADR 016), but the home page,
invite page and sign-in page have no socket.

## Decision

`apps/web/src/features/auth/session-sync.ts`:

1. **One `BroadcastChannel('taskboard:session')` per tab.** A channel never receives its own
   messages, so a tab doesn't react to itself.
2. **Login, register and logout announce** `{ userId }` (`null` after a sign-out). An expired
   session announces `null` only if this tab had a user, so a signed-out visitor's failed
   `/auth/me` doesn't sign other tabs out.
3. **Other tabs compare with the user they show.** Same user: nothing to do. Different or `null`:
   `clearSession()` (the auth query becomes `null` in place, everything else is removed); for a
   sign-in, `/auth/me` is refetched so the new user comes from the cookies. The route guards then
   redirect as usual.
4. **Messages carry only the user id**, never tokens, and are checked before use.
5. Browsers without `BroadcastChannel` simply don't sync; nothing breaks.

## Alternatives considered

- **`storage` events on `localStorage`:** also cross-tab, but we'd write a value only to make an
  event fire, and need to clean it up; `BroadcastChannel` is made for this and supported by all
  current browsers.
- **Polling `/auth/me`** (or refetch on window focus): requests from every idle tab, and a tab in
  the background stays wrong until it's focused or the timer fires.
- **A per-user socket room:** needs the server, works only while a socket is open (board pages),
  and would mix devices: logging out on a phone shouldn't sign out a laptop (ADR 016).

## Consequences

- Good: sign-in and sign-out show up in every tab instantly, on every page, with no server
  work.
- Good: easy to test: a test opens its own `BroadcastChannel` with the same name to stand in for
  another tab.
- Bad: only tabs of the same browser profile; other devices still rely on ADR 016's socket
  disconnect and the next failed request.
- Bad: one more place that must call `announceSession` if a new way to sign in or out is added.
