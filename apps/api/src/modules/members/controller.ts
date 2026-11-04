import type { UpdateMemberInput } from '@taskboard/shared';
import type { RequestHandler } from 'express';
import { requireObjectIdParam } from '../../lib/params.js';
import { getAuthUserId } from '../../middleware/require-auth.js';
import { getBoardContext } from '../../middleware/require-board-role.js';
import type { WithBody } from '../../middleware/validate.js';
import * as membersService from './service.js';

const memberParam = (params: Record<string, string | string[] | undefined>) =>
  requireObjectIdParam(params, 'userId', 'Member not found');

export const changeRole: WithBody<UpdateMemberInput> = async (req, res) => {
  const { boardId } = getBoardContext(req);
  const members = await membersService.changeRole(
    boardId,
    getAuthUserId(req),
    memberParam(req.params),
    req.body.role,
  );
  res.json({ members });
};

export const removeMember: RequestHandler = async (req, res) => {
  const { boardId } = getBoardContext(req);
  const members = await membersService.removeMember(
    boardId,
    getAuthUserId(req),
    memberParam(req.params),
  );
  res.json({ members });
};
