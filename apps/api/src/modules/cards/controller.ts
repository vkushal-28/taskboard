import type {
  AddChecklistItemInput,
  CreateCardInput,
  MoveCardInput,
  UpdateCardInput,
  UpdateChecklistItemInput,
} from '@taskboard/shared';
import type { RequestHandler } from 'express';
import { requireObjectIdParam, requireParam } from '../../lib/params.js';
import { getAuthUserId } from '../../middleware/require-auth.js';
import { getBoardContext } from '../../middleware/require-board-role.js';
import type { WithBody } from '../../middleware/validate.js';
import * as cardsService from './service.js';

/** POST /lists/:listId/cards (member+): adds a card to the list. */
export const createCard: WithBody<CreateCardInput> = async (req, res) => {
  const { boardId } = getBoardContext(req);
  const listId = requireParam(req.params, 'listId');
  const card = await cardsService.createCard(boardId, listId, getAuthUserId(req), req.body);
  res.status(201).json({ card });
};

/** GET /cards/:cardId (viewer+): one card. */
export const getCard: RequestHandler = async (req, res) => {
  const { boardId } = getBoardContext(req);
  const card = await cardsService.getCard(boardId, requireParam(req.params, 'cardId'));
  res.json({ card });
};

/** PATCH /cards/:cardId (member+): changes the card's fields. */
export const updateCard: WithBody<UpdateCardInput> = async (req, res) => {
  const { boardId } = getBoardContext(req);
  const cardId = requireParam(req.params, 'cardId');
  const card = await cardsService.updateCard(boardId, cardId, getAuthUserId(req), req.body);
  res.json({ card });
};

/** PATCH /cards/:cardId/move (member+): moves the card between two neighbours. */
export const moveCard: WithBody<MoveCardInput> = async (req, res) => {
  const { boardId } = getBoardContext(req);
  const cardId = requireParam(req.params, 'cardId');
  const card = await cardsService.moveCard(boardId, cardId, getAuthUserId(req), req.body);
  res.json({ card });
};

/** DELETE /cards/:cardId (member+): deletes the card. */
export const deleteCard: RequestHandler = async (req, res) => {
  const { boardId } = getBoardContext(req);
  await cardsService.deleteCard(boardId, requireParam(req.params, 'cardId'), getAuthUserId(req));
  res.status(204).end();
};

/** POST /cards/:cardId/checklist (member+): adds a checklist item. */
export const addChecklistItem: WithBody<AddChecklistItemInput> = async (req, res) => {
  const { boardId } = getBoardContext(req);
  const cardId = requireParam(req.params, 'cardId');
  const card = await cardsService.addChecklistItem(boardId, cardId, getAuthUserId(req), req.body);
  res.status(201).json({ card });
};

/** PATCH /cards/:cardId/checklist/:itemId (member+): edits or ticks one item. */
export const updateChecklistItem: WithBody<UpdateChecklistItemInput> = async (req, res) => {
  const { boardId } = getBoardContext(req);
  const card = await cardsService.updateChecklistItem(
    boardId,
    requireParam(req.params, 'cardId'),
    requireObjectIdParam(req.params, 'itemId', 'Checklist item not found'),
    getAuthUserId(req),
    req.body,
  );
  res.json({ card });
};

/** DELETE /cards/:cardId/checklist/:itemId (member+): removes one item. */
export const deleteChecklistItem: RequestHandler = async (req, res) => {
  const { boardId } = getBoardContext(req);
  const card = await cardsService.deleteChecklistItem(
    boardId,
    requireParam(req.params, 'cardId'),
    requireObjectIdParam(req.params, 'itemId', 'Checklist item not found'),
    getAuthUserId(req),
  );
  res.json({ card });
};
