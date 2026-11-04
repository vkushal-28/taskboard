import { z } from 'zod';
import { boardMemberDtoSchema, cardDtoSchema, listDtoSchema, objectIdSchema } from './boards.js';
import { commentDtoSchema } from './comments.js';
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

/** Sent on drag start (`cardId`) and on drop or cancel (`null`). Never saved. */
export const CARD_DRAG = 'card:drag';
export const cardDragSchema = z.object({
  boardId: objectIdSchema,
  cardId: objectIdSchema.nullable(),
});
export type CardDragInput = z.infer<typeof cardDragSchema>;

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
  // The card's new commentCount arrives separately, as card:updated.
  'comment:created': z.object({ ...eventBase, comment: commentDtoSchema }),
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
  // After a join, a role change or a removal. A client that is no longer listed was removed.
  'members:updated': z.object({ ...eventBase, members: z.array(boardMemberDtoSchema) }),
} as const;

export type BoardEventName = keyof typeof boardEventSchemas;
export type BoardEventPayload<E extends BoardEventName> = z.infer<(typeof boardEventSchemas)[E]>;
export const BOARD_EVENTS = Object.keys(boardEventSchemas) as BoardEventName[];

// Server -> client signals that are not DB writes: who is on the board and who is dragging
// what. They live outside boardEventSchemas because they never touch the board cache.

export const PRESENCE_UPDATE = 'presence:update';
export const CARD_DRAGGING = 'card:dragging';

export const presenceUpdateSchema = z.object({
  boardId: z.string(),
  /** Each online user once, however many tabs they have open. */
  userIds: z.array(z.string()),
});
export type PresenceUpdate = z.infer<typeof presenceUpdateSchema>;

export const cardDraggingSchema = z.object({
  boardId: z.string(),
  userId: z.string(),
  /** `null` when the drag ended. */
  cardId: z.string().nullable(),
});
export type CardDragging = z.infer<typeof cardDraggingSchema>;

// Typed event maps for `new Server<...>()` and `io<...>()`.

export type ServerToClientEvents = {
  [E in BoardEventName]: (payload: BoardEventPayload<E>) => void;
} & {
  [PRESENCE_UPDATE]: (payload: PresenceUpdate) => void;
  [CARD_DRAGGING]: (payload: CardDragging) => void;
};

export interface ClientToServerEvents {
  [BOARD_JOIN]: (payload: BoardJoinInput, ack: (result: BoardJoinAck) => void) => void;
  [BOARD_LEAVE]: (payload: BoardJoinInput) => void;
  [CARD_DRAG]: (payload: CardDragInput) => void;
}
