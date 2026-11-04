import { Router } from 'express';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireBoardRole } from '../../middleware/require-board-role.js';
import * as controller from './controller.js';

// Mounted at the app root, so each route authenticates itself.
export function createActivityRouter(): Router {
  const router = Router();

  // Not board-scoped, so no requireBoardRole: the service only reads boards the user belongs to.
  router.get('/activity/recent', requireAuth, controller.listRecentActivity);
  router.get(
    '/boards/:boardId/activity',
    requireAuth,
    requireBoardRole('viewer'),
    controller.listBoardActivity,
  );
  router.get(
    '/cards/:cardId/activity',
    requireAuth,
    requireBoardRole('viewer'),
    controller.listCardActivity,
  );

  return router;
}
