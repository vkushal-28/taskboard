import { Types } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger } from '../../lib/logger.js';
import { ActivityModel } from './model.js';
import { logActivity } from './service.js';

afterEach(() => {
  vi.restoreAllMocks();
});

const entry = {
  boardId: new Types.ObjectId().toString(),
  actorId: new Types.ObjectId().toString(),
  type: 'board.created' as const,
};

describe('logActivity', () => {
  it('stores the entry with defaults for cardId and meta', async () => {
    await logActivity(entry);
    expect(await ActivityModel.findOne({ boardId: entry.boardId }).lean()).toMatchObject({
      type: 'board.created',
      cardId: null,
      meta: {},
    });
  });

  it('logs and swallows a failed write, so the request that triggered it still succeeds', async () => {
    const err = new Error('db down');
    vi.spyOn(ActivityModel, 'create').mockRejectedValueOnce(err);
    const logError = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

    await expect(logActivity(entry)).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalledWith(
      { err, boardId: entry.boardId, type: 'board.created' },
      'failed to log activity',
    );
  });
});
