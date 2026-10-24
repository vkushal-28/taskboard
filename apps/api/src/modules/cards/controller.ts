import type { CreateCardInput, MoveCardInput, UpdateCardInput } from '@taskboard/shared';
import type { RequestHandler } from 'express';
import { requireParam } from '../../lib/params.js';
import { getAuthUserId } from '../../middleware/require-auth.js';
import { getBoardContext } from '../../middleware/require-board-role.js';
import type { WithBody } from '../../middleware/validate.js';
import * as cardsService from './service.js';

export const createCard: WithBody<CreateCardInput> = async (req, res) => {
  const { boardId } = getBoardContext(req);
  const listId = requireParam(req.params, 'listId');
  const card = await cardsService.createCard(boardId, listId, getAuthUserId(req), req.body);
  res.status(201).json({ card });
};

export const getCard: RequestHandler = async (req, res) => {
  const { boardId } = getBoardContext(req);
  const card = await cardsService.getCard(boardId, requireParam(req.params, 'cardId'));
  res.json({ card });
};

export const updateCard: WithBody<UpdateCardInput> = async (req, res) => {
  const { boardId } = getBoardContext(req);
  const cardId = requireParam(req.params, 'cardId');
  const card = await cardsService.updateCard(boardId, cardId, getAuthUserId(req), req.body);
  res.json({ card });
};

export const moveCard: WithBody<MoveCardInput> = async (req, res) => {
  const { boardId } = getBoardContext(req);
  const cardId = requireParam(req.params, 'cardId');
  const card = await cardsService.moveCard(boardId, cardId, getAuthUserId(req), req.body);
  res.json({ card });
};

export const deleteCard: RequestHandler = async (req, res) => {
  const { boardId } = getBoardContext(req);
  await cardsService.deleteCard(boardId, requireParam(req.params, 'cardId'), getAuthUserId(req));
  res.status(204).end();
};
