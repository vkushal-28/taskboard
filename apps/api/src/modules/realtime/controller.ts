import type { SocketTicket } from '@taskboard/shared';
import type { RequestHandler } from 'express';
import { getAuthSessionId, getAuthUserId } from '../../middleware/require-auth.js';
import { issueTicket } from './ticket-service.js';

export const createTicket: RequestHandler = async (req, res) => {
  const body: SocketTicket = {
    ticket: await issueTicket(getAuthUserId(req), getAuthSessionId(req)),
  };
  res.status(201).json(body);
};
