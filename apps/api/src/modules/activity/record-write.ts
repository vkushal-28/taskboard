import type { BoardEventName, BoardEventPayload } from '@taskboard/shared';
import { emitToBoard } from '../realtime/emitter.js';
import { logActivity, type ActivityEntry } from './service.js';

/**
 * The tail of a board write that saved one change: log it, then tell the board room, in that
 * order. Neither step throws, so a write that is already saved never becomes a failed request.
 * Writes that log or broadcast more than once (a card update that also archives, a comment),
 * or not at all (board created, invites), call logActivity and emitToBoard directly.
 */
export async function recordWrite<E extends BoardEventName>(
  activity: ActivityEntry,
  event: E,
  payload: BoardEventPayload<E>,
): Promise<void> {
  await logActivity(activity);
  emitToBoard(activity.boardId, event, payload);
}
