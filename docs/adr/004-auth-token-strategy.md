# ADR 004: Access JWT + rotating opaque refresh token in httpOnly cookies

- **Status:** Accepted
- **Date:** 2026-10-23

## Context

Taskboard needs login that survives page reloads, keeps tokens away from JavaScript (XSS), lets us end a session server-side, and works when the web app (Vercel) and api (Render) are on different sites. Roles are per board and change at runtime, so they cannot live in a token.

## Decision

- **Access token:** HS256 JWT signed with `jose`, claim `sub` only, 15 minutes, cookie `tb_access` (`Path=/`). Verified statelessly by `requireAuth`.
- **Refresh token:** 32 random bytes (opaque, not a JWT), 7 days, cookie `tb_refresh` (`Path=/auth`). Only its SHA-256 hash is stored in `refresh_tokens`, with a TTL index on `expiresAt`.
- **Rotation:** every `/auth/refresh` atomically revokes the presented token (`findOneAndUpdate` on `revokedAt: null`) and issues a new one in the same `familyId`.
- **Reuse detection:** presenting an already-revoked token revokes the whole family. Exception: a token rotated less than 10 s ago returns 401 without revoking, because two tabs refreshing at once is a race, not theft. The web client also deduplicates concurrent refreshes (Phase 3).
- **Cookies:** `HttpOnly` always. Local: `SameSite=Lax`, not `Secure` (localhost:5173 and :4000 are same-site). Production: `SameSite=None; Secure`, because `*.vercel.app` and `*.onrender.com` are separate sites.
- **CSRF:** writes must carry an `Origin` equal to `CLIENT_URL` (or no `Origin`, i.e. a non-browser client); bodies are JSON only, which forces a CORS preflight cross-origin; GET never changes state.
- **Passwords:** `bcryptjs`, cost 12, 8–72 bytes; unknown emails are compared against a dummy hash so timing does not reveal accounts.

## Alternatives considered

- **Refresh token as a JWT** — rotation and revocation need a DB lookup anyway, so signing adds a secret and nothing else.
- **Tokens in localStorage + Authorization header** — no CSRF, but any XSS can steal a long-lived token.
- **Server sessions (express-session + Mongo store)** — simpler revocation, but a DB read on every request and the same cross-site cookie problem.
- **Strict reuse detection without a grace window** — slightly stronger, but logs users out whenever two tabs refresh together.
- **`jsonwebtoken` / native `bcrypt`** — CommonJS with separate types / a native build step that pnpm 12 must approve.

## Consequences

- Good: no tokens readable by JavaScript; stolen refresh tokens are detected on reuse; a DB leak exposes no usable tokens; sessions can be ended server-side.
- Bad / tradeoffs: an access token stays valid up to 15 minutes after logout; the 10 s grace window lets a thief who races the real user get one 401 instead of triggering revocation; in-memory rate limiting only works with a single api instance.
- Open (Phase 7): Safari blocks third-party cookies, so `SameSite=None` across `vercel.app` / `onrender.com` fails there. Options: a custom domain with `app.` and `api.` subdomains (same-site, can use `Lax`), or proxying the api through Vercel rewrites (complicates Socket.IO). Cookie flags are centralised in `modules/auth/cookies.ts`, so this is a config change.
