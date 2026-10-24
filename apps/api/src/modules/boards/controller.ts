import type { CreateBoardInput, UpdateBoardInput } from '@taskboard/shared';
import type { RequestHandler } from 'express';
import { getAuthUserId } from '../../middleware/require-auth.js';
import { getBoardContext } from '../../middleware/require-board-role.js';
import type { WithBody } from '../../middleware/validate.js';
import * as boardsService from './service.js';

export const listBoards: RequestHandler = async (req, res) => {
  const boards = await boardsService.listBoardsForUser(getAuthUserId(req));
  res.json({ boards });
};

export const createBoard: WithBody<CreateBoardInput> = async (req, res) => {
  const detail = await boardsService.createBoard(getAuthUserId(req), req.body);
  res.status(201).json(detail);
};

export const getBoard: RequestHandler = async (req, res) => {
  const { boardId, role } = getBoardContext(req);
  res.json(await boardsService.getBoardDetail(boardId, role));
};

export const updateBoard: WithBody<UpdateBoardInput> = async (req, res) => {
  const { boardId, role } = getBoardContext(req);
  const board = await boardsService.updateBoard(boardId, getAuthUserId(req), role, req.body);
  res.json({ board });
};

export const deleteBoard: RequestHandler = async (req, res) => {
  await boardsService.deleteBoard(getBoardContext(req).boardId);
  res.status(204).end();
};
