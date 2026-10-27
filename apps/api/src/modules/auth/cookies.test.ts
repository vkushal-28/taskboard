import { describe, expect, it } from 'vitest';
import { cookieFlags } from './cookies.js';

describe('cookieFlags', () => {
  it('uses SameSite=None with Secure, for the cross-site production setup', () => {
    expect(cookieFlags(true)).toEqual({ httpOnly: true, secure: true, sameSite: 'none' });
  });

  // Browsers reject SameSite=None without Secure, so insecure cookies must be Lax.
  it('falls back to SameSite=Lax without Secure', () => {
    expect(cookieFlags(false)).toEqual({ httpOnly: true, secure: false, sameSite: 'lax' });
  });
});
