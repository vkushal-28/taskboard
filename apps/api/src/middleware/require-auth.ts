import type { Request, RequestHandler } from 'express';
import { Unauthorized } from '../lib/errors.js';
import { ACCESS_COOKIE, readCookie } from '../modules/auth/cookies.js';
import { verifyAccessToken } from '../modules/auth/tokens.js';

/**
 * Lets a request through only with a valid access-token cookie, and stores the user and session ids
 * on `req` for later handlers.
 */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const token = readCookie(req, ACCESS_COOKIE);
  if (!token) throw new Unauthorized();
  const { userId, sessionId } = await verifyAccessToken(token);
  req.userId = userId;
  req.sessionId = sessionId;
  next();
};

/** The session requireAuth found in the access token (ADR 016). */
export function getAuthSessionId(req: Request): string {
  if (!req.sessionId) throw new Unauthorized();
  return req.sessionId;
}

/** The signed-in user's id. Only call it in handlers behind `requireAuth`. */
export function getAuthUserId(req: Request): string {
  if (!req.userId) throw new Unauthorized();
  return req.userId;
}
