import { updateMemberSchema } from '@taskboard/shared';
import { Router } from 'express';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireBoardRole } from '../../middleware/require-board-role.js';
import { validateBody } from '../../middleware/validate.js';
import * as controller from './controller.js';

// Mounted at the app root, so each route authenticates itself.
export function createMembersRouter(): Router {
  const router = Router();
  const ownerOnly = [requireAuth, requireBoardRole('owner')];

  router.patch(
    '/boards/:boardId/members/:userId',
    ...ownerOnly,
    validateBody(updateMemberSchema),
    controller.changeRole,
  );
  router.delete('/boards/:boardId/members/:userId', ...ownerOnly, controller.removeMember);

  return router;
}
