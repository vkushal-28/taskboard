import { createInviteSchema, MINUTE_MS } from '@taskboard/shared';
import { Router, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { TooManyRequests } from '../../lib/errors.js';
import { getAuthUserId, requireAuth } from '../../middleware/require-auth.js';
import { requireBoardRole } from '../../middleware/require-board-role.js';
import { validateBody } from '../../middleware/validate.js';
import * as controller from './controller.js';

export const INVITE_EMAILS_PER_WINDOW = 20;
const RATE_LIMIT_WINDOW_MS = 15 * MINUTE_MS;

/**
 * Create and resend send an email, so they share one budget per user. Without it, Resend in
 * a loop would flood one inbox from our sender. Keyed by user, not IP, and placed after the
 * owner check, so only real attempts count.
 */
function inviteEmailLimit(): RequestHandler {
  return rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    limit: INVITE_EMAILS_PER_WINDOW,
    keyGenerator: (req) => getAuthUserId(req),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new TooManyRequests('Too many invites. Try again later.')),
  });
}

// A factory, mounted at the app root: each route authenticates itself, and every app instance
// (and every test) gets fresh rate-limit counters.
export function createInvitesRouter(): Router {
  const router = Router();
  const ownerOnly = [requireAuth, requireBoardRole('owner')];
  const emailLimit = inviteEmailLimit();

  router.get('/boards/:boardId/invites', ...ownerOnly, controller.listInvites);
  router.post(
    '/boards/:boardId/invites',
    ...ownerOnly,
    emailLimit,
    validateBody(createInviteSchema),
    controller.createInvite,
  );
  router.post(
    '/boards/:boardId/invites/:inviteId/resend',
    ...ownerOnly,
    emailLimit,
    controller.resendInvite,
  );
  router.delete('/boards/:boardId/invites/:inviteId', ...ownerOnly, controller.revokeInvite);

  // Not board-scoped: the token names the board, and only the invited email may use it.
  router.get('/invites/:token', requireAuth, controller.previewInvite);
  router.post('/invites/:token/accept', requireAuth, controller.acceptInvite);

  return router;
}
