import type { CookieOptions, Response } from 'express';
import { env } from '../../config/env.js';
import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_MS } from './tokens.js';

export const ACCESS_COOKIE = 'tb_access';
export const REFRESH_COOKIE = 'tb_refresh';

/**
 * The refresh cookie is only sent to the auth routes, so it never travels with ordinary API
 * calls. Behind the Vercel proxy the browser sees those routes under `/api/auth` (ADR 018).
 */
export function refreshCookiePath(apiPublicPath: string): string {
  return `${apiPublicPath}/auth`;
}

// The browser always talks to the api on the web app's own site: localhost in development and
// in the Docker stack, the Vercel proxy in production (ADR 018). So the cookies are
// first-party and can stay SameSite=Lax: a page on another site never gets them sent along.
export function cookieFlags(secure: boolean): CookieOptions {
  return { httpOnly: true, secure, sameSite: 'lax' };
}

function baseCookieOptions(): CookieOptions {
  return cookieFlags(env.COOKIE_SECURE);
}

const REFRESH_COOKIE_PATH = refreshCookiePath(env.API_PUBLIC_PATH);

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  const base = baseCookieOptions();
  res.cookie(ACCESS_COOKIE, accessToken, {
    ...base,
    path: '/',
    maxAge: ACCESS_TOKEN_TTL_SECONDS * 1000,
  });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...base,
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_TOKEN_TTL_MS,
  });
}

export function clearAuthCookies(res: Response): void {
  const base = baseCookieOptions();
  res.clearCookie(ACCESS_COOKIE, { ...base, path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...base, path: REFRESH_COOKIE_PATH });
}

// cookie-parser types req.cookies as `any`; narrow to a string or nothing. Takes any request
// object, so the Socket.IO handshake (a plain IncomingMessage after cookie-parser) can use it.
export function readCookie(req: object, name: string): string | undefined {
  const cookies: unknown = 'cookies' in req ? req.cookies : undefined;
  if (typeof cookies !== 'object' || cookies === null) return undefined;
  const value: unknown = (cookies as Record<string, unknown>)[name];
  return typeof value === 'string' && value !== '' ? value : undefined;
}
