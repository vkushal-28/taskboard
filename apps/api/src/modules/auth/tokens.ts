import { randomBytes } from 'node:crypto';
import { DAY_MS } from '@taskboard/shared';
import { errors, jwtVerify, SignJWT } from 'jose';
import { env } from '../../config/env.js';
import { Unauthorized } from '../../lib/errors.js';
import { sha256Hex } from '../../lib/hash.js';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_MS = 7 * DAY_MS;

const accessSecret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

/** Who a valid access token belongs to, and which refresh family (session) issued it. */
interface AccessClaims {
  userId: string;
  sessionId: string;
}

/**
 * `sid` names the refresh family, so revoking a session can also disconnect the sockets that
 * session opened (ADR 016).
 */
export async function signAccessToken(userId: string, sessionId: string): Promise<string> {
  return new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(accessSecret);
}

/**
 * Checks an access token's signature and expiry and returns who it belongs to. Throws
 * `Unauthorized` for anything invalid.
 */
export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  try {
    const { payload } = await jwtVerify(token, accessSecret, { algorithms: ['HS256'] });
    const { sub, sid } = payload;
    if (!sub || typeof sid !== 'string' || sid === '') {
      throw new Unauthorized('Invalid access token');
    }
    return { userId: sub, sessionId: sid };
  } catch (err) {
    if (err instanceof errors.JWTExpired) throw new Unauthorized('Access token expired');
    if (err instanceof errors.JOSEError) throw new Unauthorized('Invalid access token');
    throw err;
  }
}

/** 32 random bytes for a new refresh token. Only its hash is stored. */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

/** The form a refresh token is stored and looked up in. */
export function hashRefreshToken(token: string): string {
  return sha256Hex(token);
}
