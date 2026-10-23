import { createHash, randomBytes } from 'node:crypto';
import { errors, jwtVerify, SignJWT } from 'jose';
import { env } from '../../config/env.js';
import { Unauthorized } from '../../lib/errors.js';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const accessSecret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

export async function signAccessToken(userId: string): Promise<string> {
  return new SignJWT()
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(accessSecret);
}

export async function verifyAccessToken(token: string): Promise<string> {
  try {
    const { payload } = await jwtVerify(token, accessSecret, { algorithms: ['HS256'] });
    if (!payload.sub) throw new Unauthorized('Invalid access token');
    return payload.sub;
  } catch (err) {
    if (err instanceof errors.JWTExpired) throw new Unauthorized('Access token expired');
    if (err instanceof errors.JOSEError) throw new Unauthorized('Invalid access token');
    throw err;
  }
}

export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
