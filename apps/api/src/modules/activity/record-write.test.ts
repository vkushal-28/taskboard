import { Types } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setRealtimeServer, type RealtimeServer } from '../realtime/emitter.js';
import { ActivityModel } from './model.js';
import { recordWrite } from './record-write.js';

afterEach(() => {
  setRealtimeServer(null);
  vi.restoreAllMocks();
});

describe('recordWrite', () => {
  it('saves the activity row before it broadcasts the event', async () => {
    const boardId = new Types.ObjectId().toString();
    const actorId = new Types.ObjectId().toString();
    const rowsAtEmit: number[] = [];
    const emit = vi.fn(() => {
      void ActivityModel.countDocuments({ boardId }).then((count) => rowsAtEmit.push(count));
      return true;
    });
    const to = vi.fn(() => ({ emit }));
    // Only `to(room).emit(...)` is used by emitToBoard, so a stand-in for that is enough.
    setRealtimeServer({ to } as unknown as RealtimeServer);

    await recordWrite(
      { boardId, actorId, type: 'list.deleted', meta: { listId: 'l1', title: 'Done' } },
      'list:deleted',
      { boardId, actorId, listId: 'l1' },
    );

    expect(to).toHaveBeenCalledWith(`board:${boardId}`);
    expect(emit).toHaveBeenCalledWith('list:deleted', { boardId, actorId, listId: 'l1' });
    await vi.waitFor(() => expect(rowsAtEmit).toEqual([1]));
  });
});
