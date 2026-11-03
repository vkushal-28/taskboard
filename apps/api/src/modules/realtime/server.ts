import type { Server as HttpServer } from 'node:http';
import {
  BOARD_JOIN,
  BOARD_LEAVE,
  boardJoinSchema,
  boardRoom,
  type BoardJoinAck,
} from '@taskboard/shared';
import cookieParser from 'cookie-parser';
import { Server } from 'socket.io';
import { env } from '../../config/env.js';
import { AppError, Unauthorized } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { findMemberRole } from '../boards/access.js';
import { ACCESS_COOKIE, readCookie } from '../auth/cookies.js';
import { verifyAccessToken } from '../auth/tokens.js';
import { type RealtimeServer } from './emitter.js';

/**
 * Attaches Socket.IO to the HTTP server. Sockets are read-only: they authenticate, join the
 * rooms of boards the user belongs to, and receive events that services emit after DB writes.
 */
export function createRealtimeServer(httpServer: HttpServer): RealtimeServer {
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
      .then((userId) => {
        socket.data.userId = userId;
        next();
      })
      .catch((err: unknown) => next(toConnectError(err)));
  });

  io.on('connection', (socket) => {
    const { userId } = socket.data;

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
        const role = await findMemberRole(boardId, userId);
        if (!role) {
          reply(failure('NOT_FOUND', 'Board not found'));
          return;
        }
        await socket.join(boardRoom(boardId));
        reply({ ok: true, role });
      } catch (err) {
        logger.error({ err, boardId }, 'board join failed');
        reply(failure('INTERNAL_ERROR', 'Could not join the board'));
      }
    });

    socket.on(BOARD_LEAVE, async (payload: unknown) => {
      const parsed = boardJoinSchema.safeParse(payload);
      if (parsed.success) await socket.leave(boardRoom(parsed.data.boardId));
    });
  });

  return io;
}

/** The user id from the handshake's access-token cookie, or Unauthorized. */
async function authenticate(handshake: object): Promise<string> {
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
