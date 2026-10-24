import type { ActivityType } from '@taskboard/shared';
import { logger } from '../../lib/logger.js';
import { ActivityModel } from './model.js';

export interface ActivityEntry {
  boardId: string;
  actorId: string;
  type: ActivityType;
  cardId?: string;
  meta?: Record<string, unknown>;
}

/**
 * Records a write that already succeeded. Never throws: failing the request here would make
 * the client retry a write that is already saved, so a lost activity row is the lesser harm.
 */
export async function logActivity(entry: ActivityEntry): Promise<void> {
  try {
    await ActivityModel.create({ ...entry, cardId: entry.cardId ?? null, meta: entry.meta ?? {} });
  } catch (err) {
    logger.error({ err, boardId: entry.boardId, type: entry.type }, 'failed to log activity');
  }
}
