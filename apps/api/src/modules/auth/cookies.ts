import type { CookieOptions, Request, Response } from 'express';
import { env } from '../../config/env.js';
import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_MS } from './tokens.js';

export const ACCESS_COOKIE = 'tb_access';
export const REFRESH_COOKIE = 'tb_refresh';

// The refresh cookie is only sent to /auth routes, so it never travels with ordinary API calls.
const REFRESH_COOKIE_PATH = '/auth';

// In production the web (Vercel) and api (Render) are on different sites, which needs
// SameSite=None + Secure for cookies to be sent at all. See ADR 004.
function baseCookieOptions(): CookieOptions {
  const production = env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: production,
    sameSite: production ? 'none' : 'lax',
  };
}

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

// cookie-parser types req.cookies as `any`; narrow to a string or nothing.
export function readCookie(req: Request, name: string): string | undefined {
  const cookies: unknown = req.cookies;
  if (typeof cookies !== 'object' || cookies === null) return undefined;
  const value: unknown = (cookies as Record<string, unknown>)[name];
  return typeof value === 'string' && value !== '' ? value : undefined;
}
