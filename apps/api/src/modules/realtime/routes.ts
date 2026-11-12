import { MINUTE_MS } from '@taskboard/shared';
import { Router, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { TooManyRequests } from '../../lib/errors.js';
import { getAuthUserId, requireAuth } from '../../middleware/require-auth.js';
import * as controller from './controller.js';

/** A tab asks once per connection attempt; this is far above that, and stops a loop. */
export const SOCKET_TICKETS_PER_MINUTE = 30;

function ticketLimit(): RequestHandler {
  return rateLimit({
    windowMs: MINUTE_MS,
    limit: SOCKET_TICKETS_PER_MINUTE,
    keyGenerator: (req) => getAuthUserId(req),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new TooManyRequests()),
  });
}

// A factory, so every app instance (and every test) gets fresh rate-limit counters.
export function createRealtimeRouter(): Router {
  const router = Router();
  router.post('/realtime/ticket', requireAuth, ticketLimit(), controller.createTicket);
  return router;
}
