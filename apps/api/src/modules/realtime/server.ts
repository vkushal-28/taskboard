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
  type BoardJoinAck,
} from '@taskboard/shared';
import cookieParser from 'cookie-parser';
import { Server, type Socket } from 'socket.io';
import { env } from '../../config/env.js';
import { AppError, Unauthorized } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { findMemberRole } from '../boards/access.js';
import { ACCESS_COOKIE, readCookie } from '../auth/cookies.js';
import { verifyAccessToken, type AccessClaims } from '../auth/tokens.js';
import {
  broadcastPresence as broadcastPresenceFor,
  sessionRoom,
  type RealtimeServer,
} from './emitter.js';
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
    cors: { origin: clientOrigin, credentials: true },
    // CORS does not cover WebSocket upgrades and the browser still sends our cookie, so a
    // foreign page could open a socket as the user (cross-site WebSocket hijacking). Reject
    // any handshake whose Origin is not the web app. No Origin means a non-browser client,
    // which has no victim's cookies to borrow, the same rule as requireSameOrigin.
    allowRequest: (req, callback) => {
      const origin = req.headers.origin;
      callback(null, origin === undefined || origin === clientOrigin);
    },
  });

  // Runs the same cookie-parser as the REST app on the handshake request.
  io.engine.use(cookieParser());

  io.use((socket, next) => {
    authenticate(socket.request)
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

/** The user and session from the handshake's access-token cookie, or Unauthorized. */
async function authenticate(handshake: object): Promise<AccessClaims> {
  const token = readCookie(handshake, ACCESS_COOKIE);
  if (!token) throw new Unauthorized();
  return verifyAccessToken(token);
}

function failure(code: string, message: string): BoardJoinAck {
  return { ok: false, error: { code, message } };
}

// The client reads `err.data.code` in its `connect_error` handler. UNAUTHORIZED (missing,
// invalid or expired access token) means: refresh the session, then reconnect.
function toConnectError(err: unknown): Error & { data: { code: string } } {
  const code = err instanceof AppError && err.status === 401 ? err.code : 'UNAUTHORIZED';
  if (!(err instanceof AppError)) logger.error({ err }, 'socket handshake failed');
  return Object.assign(new Error('Authentication required'), { data: { code } });
}
