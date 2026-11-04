import { createCommentSchema } from '@taskboard/shared';
import { Router } from 'express';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireBoardRole } from '../../middleware/require-board-role.js';
import { validateBody } from '../../middleware/validate.js';
import * as controller from './controller.js';

// Mounted at the app root, like the cards router, so each route authenticates itself.
export function createCommentsRouter(): Router {
  const router = Router();

  router.get(
    '/cards/:cardId/comments',
    requireAuth,
    requireBoardRole('viewer'),
    controller.listComments,
  );
  router.post(
    '/cards/:cardId/comments',
    requireAuth,
    requireBoardRole('member'),
    validateBody(createCommentSchema),
    controller.addComment,
  );

  return router;
}
