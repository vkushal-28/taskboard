import type { Server as HttpServer } from 'node:http';
import {
  BOARD_JOIN,
  BOARD_LEAVE,
  boardJoinSchema,
  boardRoom,
  CARD_DRAG,
  CARD_DRAGGING,
  cardDragSchema,
  hasRole,
  socketTicketSchema,
  type BoardJoinAck,
} from '@taskboard/shared';
import { Server, type Socket } from 'socket.io';
import { env } from '../../config/env.js';
import { AppError, Unauthorized } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { findMemberRole } from '../boards/access.js';
import { isSessionActive } from '../auth/service.js';
import {
  broadcastPresence as broadcastPresenceFor,
  sessionRoom,
  type RealtimeServer,
} from './emitter.js';
import { redeemTicket, type TicketClaims } from './service.js';
import { createMessageLimiter, SOCKET_MESSAGE_LIMIT, type MessageLimit } from './rate-limit.js';

type RealtimeSocket =
  RealtimeServer extends Server<infer C, infer S, infer I, infer D> ? Socket<C, S, I, D> : never;

const BOARD_ROOM_PREFIX = boardRoom('');

/**
 * Attaches Socket.IO to the HTTP server. Sockets are read-only: they authenticate, join the
 * rooms of boards the user belongs to, and receive events that services emit after DB writes.
 * The only things sockets send are presence and drag cues, which are never saved.
 */
export function createRealtimeServer(
  httpServer: HttpServer,
  { messageLimit = SOCKET_MESSAGE_LIMIT }: { messageLimit?: MessageLimit } = {},
): RealtimeServer {
  const clientOrigin = new URL(env.CLIENT_URL).origin;

  const io: RealtimeServer = new Server(httpServer, {
    cors: { origin: clientOrigin },
    // Sockets log in with a ticket, not the cookie (ADR 018), and a foreign page can't get a
    // ticket: the ticket endpoint needs the cookie and passes the same Origin check as every
    // write. This check stays as a second wall against cross-site socket hijacking. No Origin
    // means a non-browser client, the same rule as requireSameOrigin.
    allowRequest: (req, callback) => {
      const origin = req.headers.origin;
      callback(null, origin === undefined || origin === clientOrigin);
    },
  });

  io.use((socket, next) => {
    authenticate(socket.handshake.auth)
      .then(({ userId, sessionId }) => {
        socket.data = { userId, sessionId, boards: {}, dragging: null };
        next();
      })
      .catch((err: unknown) => next(toConnectError(err)));
  });

  const broadcastPresence = (boardId: string) => broadcastPresenceFor(io, boardId);

  function endDrag(socket: RealtimeSocket, boardId?: string): void {
    const { dragging, userId } = socket.data;
    if (!dragging || (boardId !== undefined && dragging.boardId !== boardId)) return;
    socket.data.dragging = null;
    socket
      .to(boardRoom(dragging.boardId))
      .emit(CARD_DRAGGING, { boardId: dragging.boardId, userId, cardId: null });
  }

  io.on('connection', (socket) => {
    const { userId, sessionId } = socket.data;
    // Lets disconnectSession() reach every socket this session opened (ADR 016).
    void socket.join(sessionRoom(sessionId));
    // The access token stays valid for up to 15 minutes after its session is revoked, so the
    // handshake alone would let a revoked session open a new socket. Checked after joining the
    // session room: a revoke before this read is seen here, one after it reaches the room.
    // Messages wait for the answer, so nothing is joined before it.
    const sessionChecked = isSessionActive(sessionId)
      .catch((err: unknown) => {
        logger.error({ err }, 'session check failed');
        return false;
      })
      .then((active) => {
        if (!active) socket.disconnect(true);
        return active;
      });
    socket.use((_packet, next) => {
      void sessionChecked.then((active) => {
        if (active) next();
      });
    });

    // Drops messages over the limit. A dropped join gets no ack, so the client's join times
    // out and is retried on the next connect. Logged once per window, not per message.
    const allowMessage = createMessageLimiter(messageLimit);
    let warned = false;
    socket.use((packet, next) => {
      if (allowMessage()) {
        warned = false;
        return next();
      }
      if (!warned) logger.warn({ userId, event: packet[0] }, 'socket message rate limit hit');
      warned = true;
    });

    socket.on(BOARD_JOIN, async (payload: unknown, ack: unknown) => {
      if (typeof ack !== 'function') return;
      const reply = ack as (result: BoardJoinAck) => void;

      const parsed = boardJoinSchema.safeParse(payload);
      if (!parsed.success) {
        reply(failure('VALIDATION_ERROR', 'Invalid board id'));
        return;
      }
      const { boardId } = parsed.data;
      try {
        // Non-members get the same answer as a missing board, like REST (ADR 005).
        if (!(await findMemberRole(boardId, userId))) {
          reply(failure('NOT_FOUND', 'Board not found'));
          return;
        }
        await socket.join(boardRoom(boardId));
        // Read the role again now that the socket is in the room. A removal or role change
        // between the first read and the join couldn't reach this socket through
        // syncMemberSockets; any change after this read can.
        const role = await findMemberRole(boardId, userId);
        if (!role) {
          await socket.leave(boardRoom(boardId));
          reply(failure('NOT_FOUND', 'Board not found'));
          return;
        }
        socket.data.boards[boardId] = role;
        // Before the reply, so the joiner has the presence list when its join resolves.
        await broadcastPresence(boardId);
        reply({ ok: true, role });
      } catch (err) {
        logger.error({ err, boardId }, 'board join failed');
        // The join may have happened before the failure; a failed join must not leave the
        // socket receiving the board's events. Leaving a room it isn't in is harmless.
        await socket.leave(boardRoom(boardId));
        reply(failure('INTERNAL_ERROR', 'Could not join the board'));
      }
    });

    socket.on(BOARD_LEAVE, async (payload: unknown) => {
      const parsed = boardJoinSchema.safeParse(payload);
      if (!parsed.success) return;
      const { boardId } = parsed.data;
      endDrag(socket, boardId);
      delete socket.data.boards[boardId];
      await socket.leave(boardRoom(boardId));
      await broadcastPresence(boardId);
    });

    // Relayed to everyone else in the room, never saved. Only members and owners can move
    // cards, so only they can announce a drag.
    socket.on(CARD_DRAG, (payload: unknown) => {
      const parsed = cardDragSchema.safeParse(payload);
      if (!parsed.success) return;
      const { boardId, cardId } = parsed.data;
      const role = socket.data.boards[boardId];
      // The room check also covers a board deleted after the join (its room was emptied).
      if (!role || !hasRole(role, 'member') || !socket.rooms.has(boardRoom(boardId))) return;

      if (cardId === null) return endDrag(socket, boardId);
      if (socket.data.dragging?.boardId !== boardId) endDrag(socket);
      socket.data.dragging = { boardId, cardId };
      socket.to(boardRoom(boardId)).emit(CARD_DRAGGING, { boardId, userId, cardId });
    });

    // `disconnecting` still knows the rooms; by `disconnect` the socket has left them, so
    // the presence broadcast there no longer counts it. Closing a tab lands here.
    let boardIds: string[] = [];
    socket.on('disconnecting', () => {
      endDrag(socket);
      boardIds = [...socket.rooms]
        .filter((room) => room.startsWith(BOARD_ROOM_PREFIX))
        .map((room) => room.slice(BOARD_ROOM_PREFIX.length));
    });
    socket.on('disconnect', () => {
      boardIds.forEach((boardId) => void broadcastPresence(boardId));
    });
  });

  return io;
}

/**
 * The user and session behind the handshake's ticket, or Unauthorized. The socket goes to the
 * api's own address, where the browser has no login cookie, so it brings a single-use ticket
 * it fetched over REST (ADR 018). Each ticket opens one socket.
 */
async function authenticate(auth: Record<string, unknown>): Promise<TicketClaims> {
  const parsed = socketTicketSchema.safeParse(auth);
  if (!parsed.success) throw new Unauthorized();
  const claims = await redeemTicket(parsed.data.ticket);
  if (!claims) throw new Unauthorized('Socket ticket is invalid, used or expired');
  return claims;
}

function failure(code: string, message: string): BoardJoinAck {
  return { ok: false, error: { code, message } };
}

// The client reads `err.data.code` in its `connect_error` handler. UNAUTHORIZED (a missing,
// used or expired ticket) means: refresh the session, then reconnect with a new ticket.
function toConnectError(err: unknown): Error & { data: { code: string } } {
  const code = err instanceof AppError && err.status === 401 ? err.code : 'UNAUTHORIZED';
  if (!(err instanceof AppError)) logger.error({ err }, 'socket handshake failed');
  return Object.assign(new Error('Authentication required'), { data: { code } });
}
