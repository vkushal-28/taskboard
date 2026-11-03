import { z } from 'zod';
import { cardDtoSchema, listDtoSchema, objectIdSchema } from './boards.js';
import type { Role } from './roles.js';

/** The Socket.IO room for one board. Only the server joins sockets to it, after a membership check. */
export function boardRoom(boardId: string): string {
  return `board:${boardId}`;
}

// Client -> server

export const BOARD_JOIN = 'board:join';
export const BOARD_LEAVE = 'board:leave';

export const boardJoinSchema = z.object({ boardId: objectIdSchema });
export type BoardJoinInput = z.infer<typeof boardJoinSchema>;

export type BoardJoinAck =
  { ok: true; role: Role } | { ok: false; error: { code: string; message: string } };

// Server -> client. Every event names its board and the user whose write caused it, so a
// client can skip its own events (already applied optimistically).

const eventBase = { boardId: z.string(), actorId: z.string() };

export const boardEventSchemas = {
  'card:created': z.object({ ...eventBase, card: cardDtoSchema }),
  'card:updated': z.object({ ...eventBase, card: cardDtoSchema }),
  'card:moved': z.object({ ...eventBase, card: cardDtoSchema, fromListId: z.string() }),
  'card:deleted': z.object({ ...eventBase, cardId: z.string(), listId: z.string() }),
  'list:created': z.object({ ...eventBase, list: listDtoSchema }),
  'list:updated': z.object({ ...eventBase, list: listDtoSchema }),
  'list:moved': z.object({ ...eventBase, list: listDtoSchema }),
  'list:deleted': z.object({ ...eventBase, listId: z.string() }),
  // No role here: a role is per viewer, and this goes to every member of the room.
  'board:updated': z.object({
    ...eventBase,
    board: z.object({ id: z.string(), title: z.string(), color: z.string() }),
  }),
  'board:deleted': z.object(eventBase),
} as const;

export type BoardEventName = keyof typeof boardEventSchemas;
export type BoardEventPayload<E extends BoardEventName> = z.infer<(typeof boardEventSchemas)[E]>;
export const BOARD_EVENTS = Object.keys(boardEventSchemas) as BoardEventName[];

// Typed event maps for `new Server<...>()` and `io<...>()`.

export type ServerToClientEvents = {
  [E in BoardEventName]: (payload: BoardEventPayload<E>) => void;
};

export interface ClientToServerEvents {
  [BOARD_JOIN]: (payload: BoardJoinInput, ack: (result: BoardJoinAck) => void) => void;
  [BOARD_LEAVE]: (payload: BoardJoinInput) => void;
}
