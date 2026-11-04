import { createInviteSchema } from '@taskboard/shared';
import { Router } from 'express';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireBoardRole } from '../../middleware/require-board-role.js';
import { validateBody } from '../../middleware/validate.js';
import * as controller from './controller.js';

// Mounted at the app root, so each route authenticates itself.
export function createInvitesRouter(): Router {
  const router = Router();
  const ownerOnly = [requireAuth, requireBoardRole('owner')];

  router.get('/boards/:boardId/invites', ...ownerOnly, controller.listInvites);
  router.post(
    '/boards/:boardId/invites',
    ...ownerOnly,
    validateBody(createInviteSchema),
    controller.createInvite,
  );
  router.post('/boards/:boardId/invites/:inviteId/resend', ...ownerOnly, controller.resendInvite);
  router.delete('/boards/:boardId/invites/:inviteId', ...ownerOnly, controller.revokeInvite);

  // Not board-scoped: the token names the board, and only the invited email may use it.
  router.get('/invites/:token', requireAuth, controller.previewInvite);
  router.post('/invites/:token/accept', requireAuth, controller.acceptInvite);

  return router;
}
