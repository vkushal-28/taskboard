import type { CreateInviteInput } from '@taskboard/shared';
import type { RequestHandler } from 'express';
import { requireObjectIdParam, requireParam } from '../../lib/params.js';
import { getAuthUserId } from '../../middleware/require-auth.js';
import { getBoardContext } from '../../middleware/require-board-role.js';
import type { WithBody } from '../../middleware/validate.js';
import * as invitesService from './service.js';

const inviteParam = (params: Record<string, string | string[] | undefined>) =>
  requireObjectIdParam(params, 'inviteId', 'Invite not found');

/** GET /boards/:boardId/invites (owner): the pending invites. */
export const listInvites: RequestHandler = async (req, res) => {
  const invites = await invitesService.listInvites(getBoardContext(req).boardId);
  res.json({ invites });
};

/** POST /boards/:boardId/invites (owner): invites an email and returns the link. */
export const createInvite: WithBody<CreateInviteInput> = async (req, res) => {
  const { boardId } = getBoardContext(req);
  const issued = await invitesService.createInvite(boardId, getAuthUserId(req), req.body);
  res.status(201).json(issued);
};

/**
 * POST /boards/:boardId/invites/:inviteId/resend (owner): issues a new link; the old one stops
 * working.
 */
export const resendInvite: RequestHandler = async (req, res) => {
  const { boardId } = getBoardContext(req);
  const issued = await invitesService.resendInvite(
    boardId,
    getAuthUserId(req),
    inviteParam(req.params),
  );
  res.json(issued);
};

/** DELETE /boards/:boardId/invites/:inviteId (owner): cancels an invite. */
export const revokeInvite: RequestHandler = async (req, res) => {
  await invitesService.revokeInvite(
    getBoardContext(req).boardId,
    getAuthUserId(req),
    inviteParam(req.params),
  );
  res.status(204).end();
};

/** GET /invites/:token (signed in): what the accept page shows. */
export const previewInvite: RequestHandler = async (req, res) => {
  const preview = await invitesService.previewInvite(
    requireParam(req.params, 'token'),
    getAuthUserId(req),
  );
  res.json(preview);
};

/** POST /invites/:token/accept (signed in): joins the board with the invited role. */
export const acceptInvite: RequestHandler = async (req, res) => {
  const result = await invitesService.acceptInvite(
    requireParam(req.params, 'token'),
    getAuthUserId(req),
  );
  res.json(result);
};
