import { createBoardSchema, updateBoardSchema } from '@taskboard/shared';
import { Router } from 'express';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireBoardRole } from '../../middleware/require-board-role.js';
import { validateBody } from '../../middleware/validate.js';
import * as controller from './controller.js';

// Role checks run before body validation, so a viewer gets 403 rather than a 400 that reveals
// what a valid body looks like.
export function createBoardsRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/', controller.listBoards);
  router.post('/', validateBody(createBoardSchema), controller.createBoard);
  router.get('/:boardId', requireBoardRole('viewer'), controller.getBoard);
  router.patch(
    '/:boardId',
    requireBoardRole('owner'),
    validateBody(updateBoardSchema),
    controller.updateBoard,
  );
  router.delete('/:boardId', requireBoardRole('owner'), controller.deleteBoard);

  return router;
}
