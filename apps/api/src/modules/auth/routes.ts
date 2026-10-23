import { loginSchema, registerSchema } from '@taskboard/shared';
import { Router, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { TooManyRequests } from '../../lib/errors.js';
import { requireAuth } from '../../middleware/require-auth.js';
import { validateBody } from '../../middleware/validate.js';
import * as controller from './controller.js';

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

function limit(limitPerWindow: number): RequestHandler {
  return rateLimit({
    windowMs: FIFTEEN_MINUTES_MS,
    limit: limitPerWindow,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new TooManyRequests()),
  });
}

// A factory, not a module-level router, so every app instance (and every test) gets fresh
// in-memory rate-limit counters.
export function createAuthRouter(): Router {
  const router = Router();
  const credentialsLimit = limit(10);

  router.post('/register', credentialsLimit, validateBody(registerSchema), controller.register);
  router.post('/login', credentialsLimit, validateBody(loginSchema), controller.login);
  router.post('/refresh', limit(60), controller.refresh);
  router.post('/logout', controller.logout);
  router.get('/me', requireAuth, controller.me);

  return router;
}
