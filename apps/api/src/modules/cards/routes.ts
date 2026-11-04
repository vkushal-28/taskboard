import {
  addChecklistItemSchema,
  createCardSchema,
  moveCardSchema,
  updateCardSchema,
  updateChecklistItemSchema,
} from '@taskboard/shared';
import { Router } from 'express';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireBoardRole } from '../../middleware/require-board-role.js';
import { validateBody } from '../../middleware/validate.js';
import * as controller from './controller.js';

// Mounted at the app root like the lists router: create lives under /lists/:listId/cards.
export function createCardsRouter(): Router {
  const router = Router();
  const memberOnly = [requireAuth, requireBoardRole('member')];

  router.post(
    '/lists/:listId/cards',
    ...memberOnly,
    validateBody(createCardSchema),
    controller.createCard,
  );
  router.get('/cards/:cardId', requireAuth, requireBoardRole('viewer'), controller.getCard);
  router.patch(
    '/cards/:cardId',
    ...memberOnly,
    validateBody(updateCardSchema),
    controller.updateCard,
  );
  router.patch(
    '/cards/:cardId/move',
    ...memberOnly,
    validateBody(moveCardSchema),
    controller.moveCard,
  );
  router.delete('/cards/:cardId', ...memberOnly, controller.deleteCard);

  // One item at a time, so concurrent ticks don't overwrite each other (ADR 013).
  router.post(
    '/cards/:cardId/checklist',
    ...memberOnly,
    validateBody(addChecklistItemSchema),
    controller.addChecklistItem,
  );
  router.patch(
    '/cards/:cardId/checklist/:itemId',
    ...memberOnly,
    validateBody(updateChecklistItemSchema),
    controller.updateChecklistItem,
  );
  router.delete('/cards/:cardId/checklist/:itemId', ...memberOnly, controller.deleteChecklistItem);

  return router;
}
