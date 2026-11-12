import { cursorQuerySchema, type CreateCommentInput } from '@taskboard/shared';
import type { RequestHandler } from 'express';
import { requireParam } from '../../lib/params.js';
import { getAuthUserId } from '../../middleware/require-auth.js';
import { getBoardContext } from '../../middleware/require-board-role.js';
import { parseQuery, type WithBody } from '../../middleware/validate.js';
import * as commentsService from './service.js';

/** GET /cards/:cardId/comments (viewer+): one page of comments, newest first. */
export const listComments: RequestHandler = async (req, res) => {
  const { boardId } = getBoardContext(req);
  const query = parseQuery(cursorQuerySchema, req.query);
  res.json(await commentsService.listComments(boardId, requireParam(req.params, 'cardId'), query));
};

/** POST /cards/:cardId/comments (member+): adds a comment. */
export const addComment: WithBody<CreateCommentInput> = async (req, res) => {
  const { boardId } = getBoardContext(req);
  const result = await commentsService.addComment(
    boardId,
    requireParam(req.params, 'cardId'),
    getAuthUserId(req),
    req.body.body,
  );
  res.status(201).json(result);
};
