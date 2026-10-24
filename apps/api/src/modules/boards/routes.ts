import { createBoardSchema, updateBoardSchema } from '@taskboard/shared';
import { Router } from 'express';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireBoardRole } from '../../middleware/require-board-role.js';
import { validateBody } from '../../middleware/validate.js';
import * as controller from './controller.js';

// Role checks run before body validation, so a viewer gets 403 rather than a 400 that reveals
// what a valid body looks like. Auth is per route, not router.use(), because this router also
// sees /boards/:boardId/lists, which the lists router authenticates itself.
export function createBoardsRouter(): Router {
  const router = Router();
  const ownerOnly = [requireAuth, requireBoardRole('owner')];

  router.get('/', requireAuth, controller.listBoards);
  router.post('/', requireAuth, validateBody(createBoardSchema), controller.createBoard);
  router.get('/:boardId', requireAuth, requireBoardRole('viewer'), controller.getBoard);
  router.patch('/:boardId', ...ownerOnly, validateBody(updateBoardSchema), controller.updateBoard);
  router.delete('/:boardId', ...ownerOnly, controller.deleteBoard);

  return router;
}
