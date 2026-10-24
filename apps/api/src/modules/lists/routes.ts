import { createListSchema, moveListSchema, renameListSchema } from '@taskboard/shared';
import { Router } from 'express';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireBoardRole } from '../../middleware/require-board-role.js';
import { validateBody } from '../../middleware/validate.js';
import * as controller from './controller.js';

// Mounted at the app root because lists live under two prefixes: /boards/:boardId/lists for
// create and /lists/:listId for everything else. Auth is per route so unknown paths still 404.
export function createListsRouter(): Router {
  const router = Router();
  const memberOnly = [requireAuth, requireBoardRole('member')];

  router.post(
    '/boards/:boardId/lists',
    ...memberOnly,
    validateBody(createListSchema),
    controller.createList,
  );
  router.patch(
    '/lists/:listId',
    ...memberOnly,
    validateBody(renameListSchema),
    controller.renameList,
  );
  router.patch(
    '/lists/:listId/move',
    ...memberOnly,
    validateBody(moveListSchema),
    controller.moveList,
  );
  router.delete('/lists/:listId', ...memberOnly, controller.deleteList);

  return router;
}
