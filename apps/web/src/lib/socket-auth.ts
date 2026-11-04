import { socketTicketSchema } from '@taskboard/shared';
import { api } from './api';

type AuthCallback = (auth: Record<string, unknown>) => void;

/**
 * Socket.IO's `auth` option, as a function: Socket.IO calls it before every connection attempt,
 * reconnects included, so each attempt presents a fresh single-use ticket (ADR 018). The
 * ticket request is ordinary REST, so an expired access token is refreshed on the way.
 */
export function provideSocketTicket(callback: AuthCallback): void {
  api
    .request('/realtime/ticket', { method: 'POST', schema: socketTicketSchema })
    .then(({ ticket }) => callback({ ticket }))
    // Connect without one: the server answers UNAUTHORIZED, and useBoardSocket refreshes the
    // session (or signs out) before trying again.
    .catch(() => callback({}));
}
