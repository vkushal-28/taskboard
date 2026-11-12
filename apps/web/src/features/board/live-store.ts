import type { CardDragging, PresenceUpdate } from '@taskboard/shared';
import { create } from 'zustand';

/**
 * Who is on the open board and which cards they are dragging. It comes from socket signals
 * that are never saved, not from the api, so it is UI state in Zustand rather than a query.
 */
export interface LiveState {
  boardId: string | null;
  onlineUserIds: string[];
  /** Card id -> id of the user dragging it. */
  draggingByCard: Record<string, string>;
}

const EMPTY: LiveState = { boardId: null, onlineUserIds: [], draggingByCard: {} };

export const useLiveStore = create<LiveState>()(() => EMPTY);

/** Starts fresh for a board (or for none), e.g. on opening it or after the socket drops. */
export function resetLive(boardId: string | null): void {
  useLiveStore.setState({ ...EMPTY, boardId });
}

/** Applies a `presence:update`: who is online now. People who left stop showing as dragging. */
export function applyPresence(state: LiveState, update: PresenceUpdate): LiveState {
  if (update.boardId !== state.boardId) return state;
  const online = new Set(update.userIds);
  // Someone who went offline is not dragging anything any more.
  const draggingByCard = Object.fromEntries(
    Object.entries(state.draggingByCard).filter(([, userId]) => online.has(userId)),
  );
  return { ...state, onlineUserIds: update.userIds, draggingByCard };
}

/** Applies a `card:dragging` cue: which card someone is moving, or that they stopped. */
export function applyDragging(state: LiveState, cue: CardDragging): LiveState {
  if (cue.boardId !== state.boardId) return state;
  // One card per user: a new drag replaces their previous one, and `null` ends it.
  const draggingByCard = Object.fromEntries(
    Object.entries(state.draggingByCard).filter(([, userId]) => userId !== cue.userId),
  );
  if (cue.cardId !== null) draggingByCard[cue.cardId] = cue.userId;
  return { ...state, draggingByCard };
}
