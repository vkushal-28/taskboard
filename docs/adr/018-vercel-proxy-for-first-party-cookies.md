# ADR 018: Serve the api through Vercel so login cookies are first-party

- **Status:** Accepted
- **Date:** 2026-11-04

## Context

Production puts the web app on Vercel (`taskboard.vercel.app`) and the api on Render
(`taskboard-api.onrender.com`). Both `vercel.app` and `onrender.com` are on the Public Suffix
List, so the two addresses are different _sites_. ADR 004 planned for that with
`SameSite=None; Secure` cookies, but from the page's point of view those are third-party
cookies: Safari blocks them by default, Firefox (Total Cookie Protection) and Brave isolate or
block them. Sign-in would appear to work and every request after it would get a 401, for a large
part of the demo's audience.

Vercel can forward a path to another server (an external rewrite). It can't forward WebSockets.

## Decision

1. **REST goes through Vercel.** `apps/web/vercel.json` forwards `/api/*` to Render, and the web
   app calls `VITE_API_URL=/api`. To the browser the api is on the web app's own site, so the
   cookies are first-party everywhere.
2. **Cookies are `SameSite=Lax` everywhere** (and `Secure` in production). `None` is no longer
   needed: a page on another site never gets the cookies sent along, a stronger CSRF defence on
   top of the Origin check.
3. **The refresh cookie follows the public path:** `API_PUBLIC_PATH=/api` scopes it to
   `/api/auth`, the path the browser actually requests.
4. **Nothing is cached on the way:** the api sends `Cache-Control: no-store` on every response,
   and `vercel.json` turns rewrite caching off for `/api/*`. Vercel caches external rewrites by
   default when the origin allows it, and every api answer is per-user.
5. **`TRUST_PROXY`** (hop count) makes `req.ip` the visitor's address behind Vercel and Render,
   so rate limits are per client instead of one shared counter.
6. **The socket connects to Render directly** (`VITE_SOCKET_URL`) and logs in with a ticket,
   replacing ADR 010's cookie handshake:
   - `POST /realtime/ticket` (login cookie, Origin check, 30 per user per minute) returns 32
     random bytes. Only the SHA-256 is stored, with the user and session, for 30 s (a TTL index
     cleans up unused ones).
   - The handshake sends it in Socket.IO's `auth`. The server redeems it with one atomic
     `findOneAndDelete` (hash + not expired), so a ticket opens exactly one socket. Then the
     session check of ADR 016 runs as before.
   - The client passes a _function_ as `auth`; Socket.IO calls it before every connection
     attempt, so reconnects fetch a fresh ticket. That request is ordinary REST, so an expired
     access token is refreshed on the way.
   - Tickets are the only way in, also in development and Docker, so there is one mechanism to
     keep secure and tested.

## Alternatives considered

- **A custom domain** (`app.` and `api.` on one domain): the simplest code and first-party
  cookies, including on the socket. Needs a paid domain; still the best upgrade path, and this
  design keeps working with it.
- **Keep cross-site cookies (`SameSite=None`):** no work, but the demo breaks in Safari, Firefox
  strict mode and Brave.
- **Partitioned cookies (CHIPS):** browser support is uneven, and partitioning ties the cookie to
  the top-level site, which is what we would get from the proxy anyway.

## Consequences

- Good: sign-in works in every browser without a domain, and the cookies got stricter (`Lax`).
- Bad: every REST call takes one more hop (Vercel to Render), and Vercel's proxy may time out
  while a sleeping free Render service starts.
- Bad: a caller who goes to Render directly can send their own `X-Forwarded-For`. With
  `TRUST_PROXY=2` that fakes their address for the rate limits. Follow-up: have Vercel add a
  secret header and reject requests without it.
- Bad: the socket needs its own authentication (tickets), one more mechanism to keep secure,
  and one extra request (and database write) per connection.
- Accepted risk: unlike the cookie, the ticket is readable by JavaScript. It is single-use,
  expires in 30 s, only opens a socket, and is tied to a session that can be revoked; script
  injected into our page could call the api with the cookie anyway.
- Follow-ups: confirm the hop count after the first deploy (Slice 7.2); a custom domain later
  would let the socket go back to the cookie.
