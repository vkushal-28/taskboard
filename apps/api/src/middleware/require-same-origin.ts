import type { RequestHandler } from 'express';
import { Forbidden } from '../lib/errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// CSRF defence: browsers always send Origin on cross-site writes, so a write whose Origin is
// not our web app is rejected. Requests with no Origin come from non-browser clients (curl,
// tests), which cannot carry a victim's cookies, so they are allowed.
export function requireSameOrigin(allowedOrigin: string): RequestHandler {
  return (req, _res, next) => {
    const origin = req.get('origin');
    if (SAFE_METHODS.has(req.method) || origin === undefined || origin === allowedOrigin) {
      next();
      return;
    }
    next(new Forbidden('Cross-origin request rejected'));
  };
}
