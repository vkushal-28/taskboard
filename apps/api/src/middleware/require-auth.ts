import type { Request, RequestHandler } from 'express';
import { Unauthorized } from '../lib/errors.js';
import { ACCESS_COOKIE, readCookie } from '../modules/auth/cookies.js';
import { verifyAccessToken } from '../modules/auth/tokens.js';

export const requireAuth: RequestHandler = async (req, _res, next) => {
  const token = readCookie(req, ACCESS_COOKIE);
  if (!token) throw new Unauthorized();
  req.userId = await verifyAccessToken(token);
  next();
};

export function getAuthUserId(req: Request): string {
  if (!req.userId) throw new Unauthorized();
  return req.userId;
}
