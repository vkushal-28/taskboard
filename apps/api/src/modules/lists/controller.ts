import type { CreateListInput, MoveListInput, RenameListInput } from '@taskboard/shared';
import type { RequestHandler } from 'express';
import { requireParam } from '../../lib/params.js';
import { getAuthUserId } from '../../middleware/require-auth.js';
import { getBoardContext } from '../../middleware/require-board-role.js';
import type { WithBody } from '../../middleware/validate.js';
import * as listsService from './service.js';

export const createList: WithBody<CreateListInput> = async (req, res) => {
  const { boardId } = getBoardContext(req);
  const list = await listsService.createList(boardId, getAuthUserId(req), req.body);
  res.status(201).json({ list });
};

export const renameList: WithBody<RenameListInput> = async (req, res) => {
  const { boardId } = getBoardContext(req);
  const listId = requireParam(req.params, 'listId');
  const list = await listsService.renameList(boardId, listId, getAuthUserId(req), req.body);
  res.json({ list });
};

export const moveList: WithBody<MoveListInput> = async (req, res) => {
  const { boardId } = getBoardContext(req);
  const listId = requireParam(req.params, 'listId');
  const list = await listsService.moveList(boardId, listId, getAuthUserId(req), req.body);
  res.json({ list });
};

export const deleteList: RequestHandler = async (req, res) => {
  const { boardId } = getBoardContext(req);
  await listsService.deleteList(boardId, requireParam(req.params, 'listId'), getAuthUserId(req));
  res.status(204).end();
};
