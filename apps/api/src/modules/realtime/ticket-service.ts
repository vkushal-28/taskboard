import { createHash, randomBytes } from 'node:crypto';
import { SocketTicketModel } from './ticket-model.js';

/** Long enough to open a socket right after asking, short enough to be useless if leaked. */
export const SOCKET_TICKET_TTL_MS = 30_000;

export interface TicketClaims {
  userId: string;
  sessionId: string;
}

function hashTicket(ticket: string): string {
  return createHash('sha256').update(ticket).digest('hex');
}

/** A new random ticket for this user and session (ADR 018). Only its hash is stored. */
export async function issueTicket(userId: string, sessionId: string): Promise<string> {
  const ticket = randomBytes(32).toString('base64url');
  await SocketTicketModel.create({
    tokenHash: hashTicket(ticket),
    userId,
    sessionId,
    expiresAt: new Date(Date.now() + SOCKET_TICKET_TTL_MS),
  });
  return ticket;
}

/**
 * Uses a ticket up: the delete and the expiry check are one atomic operation, so two sockets
 * presenting the same ticket can't both get in. Null for an unknown, used or expired ticket.
 */
export async function redeemTicket(ticket: string): Promise<TicketClaims | null> {
  const found = await SocketTicketModel.findOneAndDelete({
    tokenHash: hashTicket(ticket),
    expiresAt: { $gt: new Date() },
  }).lean();
  return found ? { userId: found.userId.toString(), sessionId: found.sessionId } : null;
}
