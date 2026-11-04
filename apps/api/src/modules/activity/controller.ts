import { cursorQuerySchema, recentActivityQuerySchema } from '@taskboard/shared';
import type { RequestHandler } from 'express';
import { requireParam } from '../../lib/params.js';
import { getAuthUserId } from '../../middleware/require-auth.js';
import { getBoardContext } from '../../middleware/require-board-role.js';
import { parseQuery } from '../../middleware/validate.js';
import * as activityService from './service.js';

export const listRecentActivity: RequestHandler = async (req, res) => {
  const { limit } = parseQuery(recentActivityQuerySchema, req.query);
  const activity = await activityService.listRecentActivity(getAuthUserId(req), limit);
  res.json({ activity });
};

export const listBoardActivity: RequestHandler = async (req, res) => {
  const { boardId } = getBoardContext(req);
  const query = parseQuery(cursorQuerySchema, req.query);
  res.json(await activityService.listBoardActivity(boardId, query));
};

export const listCardActivity: RequestHandler = async (req, res) => {
  const { boardId } = getBoardContext(req);
  const query = parseQuery(cursorQuerySchema, req.query);
  const cardId = requireParam(req.params, 'cardId');
  res.json(await activityService.listCardActivity(boardId, cardId, query));
};
