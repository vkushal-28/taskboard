import type { CreateInviteInput } from '@taskboard/shared';
import type { RequestHandler } from 'express';
import { requireObjectIdParam, requireParam } from '../../lib/params.js';
import { getAuthUserId } from '../../middleware/require-auth.js';
import { getBoardContext } from '../../middleware/require-board-role.js';
import type { WithBody } from '../../middleware/validate.js';
import * as invitesService from './service.js';

const inviteParam = (params: Record<string, string | string[] | undefined>) =>
  requireObjectIdParam(params, 'inviteId', 'Invite not found');

export const listInvites: RequestHandler = async (req, res) => {
  const invites = await invitesService.listInvites(getBoardContext(req).boardId);
  res.json({ invites });
};

export const createInvite: WithBody<CreateInviteInput> = async (req, res) => {
  const { boardId } = getBoardContext(req);
  const issued = await invitesService.createInvite(boardId, getAuthUserId(req), req.body);
  res.status(201).json(issued);
};

export const resendInvite: RequestHandler = async (req, res) => {
  const { boardId } = getBoardContext(req);
  const issued = await invitesService.resendInvite(
    boardId,
    getAuthUserId(req),
    inviteParam(req.params),
  );
  res.json(issued);
};

export const revokeInvite: RequestHandler = async (req, res) => {
  await invitesService.revokeInvite(
    getBoardContext(req).boardId,
    getAuthUserId(req),
    inviteParam(req.params),
  );
  res.status(204).end();
};

export const previewInvite: RequestHandler = async (req, res) => {
  const preview = await invitesService.previewInvite(
    requireParam(req.params, 'token'),
    getAuthUserId(req),
  );
  res.json(preview);
};

export const acceptInvite: RequestHandler = async (req, res) => {
  const result = await invitesService.acceptInvite(
    requireParam(req.params, 'token'),
    getAuthUserId(req),
  );
  res.json(result);
};
