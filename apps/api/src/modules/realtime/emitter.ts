import {
  boardRoom,
  CARD_DRAGGING,
  hasRole,
  PRESENCE_UPDATE,
  type BoardEventName,
  type BoardEventPayload,
  type ClientToServerEvents,
  type Role,
  type ServerToClientEvents,
} from '@taskboard/shared';
import type { Server } from 'socket.io';
import { logger } from '../../lib/logger.js';

// Plain objects, not Maps: a multi-instance adapter serializes socket.data (ADR 012).
interface SocketData {
  userId: string;
  /** The refresh family (session) whose access token opened this socket. */
  sessionId: string;
  /** The role each joined board granted at join time. */
  boards: Partial<Record<string, Role>>;
  /** The card this socket is dragging, so a disconnect can clear the "moving this" cue. */
  dragging: { boardId: string; cardId: string } | null;
}

export type RealtimeServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

interface PlainEmitter {
  emit(event: string, payload: unknown): boolean;
}

// Services are plain functions, so the server is held here rather than passed through every
// call. Until one is set (tests, scripts) emits are skipped.
let io: RealtimeServer | null = null;

/**
 * Called once at startup with the Socket.IO server, so services can broadcast. Until then (tests,
 * scripts) broadcasts are skipped.
 */
export function setRealtimeServer(server: RealtimeServer | null): void {
  io = server;
}

/**
 * Broadcasts a write that already succeeded to everyone viewing the board. Never throws, for
 * the same reason as `logActivity`: the write is saved, so the request must not fail now.
 */
export function emitToBoard<E extends BoardEventName>(
  boardId: string,
  event: E,
  payload: BoardEventPayload<E>,
): void {
  if (!io) return;
  try {
    // Socket.IO's emit types can't tie a generic event name to its payload. The signature of
    // emitToBoard already does, so drop to a plain emitter for this one call.
    const room = io.to(boardRoom(boardId)) as unknown as PlainEmitter;
    room.emit(event, payload);
  } catch (err) {
    logger.error({ err, boardId, event }, 'failed to emit board event');
  }
}

/** The room holding every socket one session opened. Server-side only; clients never see it. */
export function sessionRoom(sessionId: string): string {
  return `session:${sessionId}`;
}

/**
 * Disconnects every socket a session opened, after the session was revoked (logout, refresh
 * reuse). Without it an open socket keeps receiving events after its session ended (ADR 016).
 * `disconnectSockets` goes through the adapter, so it also reaches other instances. Never
 * throws, like emitToBoard.
 */
export function disconnectSession(sessionId: string): void {
  if (!io) return;
  try {
    io.in(sessionRoom(sessionId)).disconnectSockets(true);
  } catch (err) {
    logger.error({ err }, 'failed to disconnect session sockets');
  }
}

/** Removes every socket from a board's room, e.g. after the board is deleted. */
export function closeBoardRoom(boardId: string): void {
  io?.in(boardRoom(boardId)).socketsLeave(boardRoom(boardId));
}

/**
 * Who is on the board, read from the room itself so it can't drift from who receives events
 * (ADR 012). Sent after every join, leave, disconnect and removal.
 */
export async function broadcastPresence(server: RealtimeServer, boardId: string): Promise<void> {
  try {
    const sockets = await server.in(boardRoom(boardId)).fetchSockets();
    const userIds = [...new Set(sockets.map((socket) => socket.data.userId))];
    server.to(boardRoom(boardId)).emit(PRESENCE_UPDATE, { boardId, userIds });
  } catch (err) {
    logger.error({ err, boardId }, 'failed to broadcast presence');
  }
}

/**
 * Applies a membership change to the user's open sockets (ADR 010): a new role updates what
 * they may send (drag cues), and `null` takes them out of the room, so they stop receiving
 * the board's events. Never throws, like emitToBoard.
 *
 * fetchSockets() returns the live socket objects on a single instance. With a multi-instance
 * adapter they are copies, and this would need serverSideEmit (Phase 7).
 */
export async function syncMemberSockets(
  boardId: string,
  userId: string,
  role: Role | null,
): Promise<void> {
  if (!io) return;
  try {
    const room = boardRoom(boardId);
    const sockets = await io.in(room).fetchSockets();
    const theirs = sockets.filter((socket) => socket.data.userId === userId);
    if (theirs.length === 0) return;
    for (const socket of theirs) {
      // A drag they can no longer finish (a viewer's drop is ignored, a removed user can't
      // send one) would leave "<name> is moving this" on everyone else's screen.
      if (socket.data.dragging?.boardId === boardId && (!role || !hasRole(role, 'member'))) {
        io.to(room).emit(CARD_DRAGGING, { boardId, userId, cardId: null });
        socket.data.dragging = null;
      }
      if (role) {
        socket.data.boards[boardId] = role;
        continue;
      }
      delete socket.data.boards[boardId];
      socket.leave(room);
    }
    if (!role) await broadcastPresence(io, boardId);
  } catch (err) {
    logger.error({ err, boardId }, 'failed to sync member sockets');
  }
}
