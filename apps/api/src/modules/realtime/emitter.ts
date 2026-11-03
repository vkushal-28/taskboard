import {
  boardRoom,
  type BoardEventName,
  type BoardEventPayload,
  type ClientToServerEvents,
  type Role,
  type ServerToClientEvents,
} from '@taskboard/shared';
import type { Server } from 'socket.io';
import { logger } from '../../lib/logger.js';

// Plain objects, not Maps: a multi-instance adapter serializes socket.data (ADR 012).
export interface SocketData {
  userId: string;
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

/** Removes every socket from a board's room, e.g. after the board is deleted. */
export function closeBoardRoom(boardId: string): void {
  io?.in(boardRoom(boardId)).socketsLeave(boardRoom(boardId));
}
