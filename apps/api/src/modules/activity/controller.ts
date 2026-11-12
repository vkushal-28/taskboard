import { cursorQuerySchema, recentActivityQuerySchema } from '@taskboard/shared';
import type { RequestHandler } from 'express';
import { requireParam } from '../../lib/params.js';
import { getAuthUserId } from '../../middleware/require-auth.js';
import { getBoardContext } from '../../middleware/require-board-role.js';
import { parseQuery } from '../../middleware/validate.js';
import * as activityService from './service.js';

/** GET /activity/recent (signed in): the newest activity across all of the user's boards. */
export const listRecentActivity: RequestHandler = async (req, res) => {
  const { limit } = parseQuery(recentActivityQuerySchema, req.query);
  const activity = await activityService.listRecentActivity(getAuthUserId(req), limit);
  res.json({ activity });
};

/** GET /boards/:boardId/activity (viewer+): one page of a board's activity. */
export const listBoardActivity: RequestHandler = async (req, res) => {
  const { boardId } = getBoardContext(req);
  const query = parseQuery(cursorQuerySchema, req.query);
  res.json(await activityService.listBoardActivity(boardId, query));
};

/** GET /cards/:cardId/activity (viewer+): one page of a card's history. */
export const listCardActivity: RequestHandler = async (req, res) => {
  const { boardId } = getBoardContext(req);
  const query = parseQuery(cursorQuerySchema, req.query);
  const cardId = requireParam(req.params, 'cardId');
  res.json(await activityService.listCardActivity(boardId, cardId, query));
};
