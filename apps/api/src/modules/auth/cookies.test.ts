import { describe, expect, it } from 'vitest';
import { cookieFlags, refreshCookiePath } from './cookies.js';

describe('cookieFlags', () => {
  // The browser reaches the api on its own site (localhost, or the Vercel proxy), so cookies
  // are first-party and never need SameSite=None (ADR 018).
  it.each([true, false])('is httpOnly and SameSite=Lax with Secure=%s', (secure) => {
    expect(cookieFlags(secure)).toEqual({ httpOnly: true, secure, sameSite: 'lax' });
  });
});

describe('refreshCookiePath', () => {
  it('is /auth when the browser calls the api directly', () => {
    expect(refreshCookiePath('')).toBe('/auth');
  });

  it('follows the public path when a proxy serves the api under /api', () => {
    expect(refreshCookiePath('/api')).toBe('/api/auth');
  });
});
