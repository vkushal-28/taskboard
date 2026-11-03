import { describe, expect, it } from 'vitest';
import { applyDragging, applyPresence, type LiveState } from './live-store';

const state = (overrides: Partial<LiveState> = {}): LiveState => ({
  boardId: 'b1',
  onlineUserIds: [],
  draggingByCard: {},
  ...overrides,
});

describe('applyPresence', () => {
  it('replaces the online list', () => {
    expect(applyPresence(state(), { boardId: 'b1', userIds: ['u1', 'u2'] }).onlineUserIds).toEqual([
      'u1',
      'u2',
    ]);
  });

  it('drops the drag of a user who went offline', () => {
    const before = state({ draggingByCard: { c1: 'u2', c2: 'u3' } });
    const next = applyPresence(before, { boardId: 'b1', userIds: ['u1', 'u3'] });
    expect(next.draggingByCard).toEqual({ c2: 'u3' });
  });

  it('ignores another board', () => {
    const before = state();
    expect(applyPresence(before, { boardId: 'b2', userIds: ['u1'] })).toBe(before);
  });
});

describe('applyDragging', () => {
  it('marks a card while it is dragged and clears it when the drag ends', () => {
    const started = applyDragging(state(), { boardId: 'b1', userId: 'u2', cardId: 'c1' });
    expect(started.draggingByCard).toEqual({ c1: 'u2' });

    const ended = applyDragging(started, { boardId: 'b1', userId: 'u2', cardId: null });
    expect(ended.draggingByCard).toEqual({});
  });

  it("replaces a user's previous drag but keeps other users' drags", () => {
    const before = state({ draggingByCard: { c1: 'u2', c3: 'u3' } });
    const next = applyDragging(before, { boardId: 'b1', userId: 'u2', cardId: 'c2' });
    expect(next.draggingByCard).toEqual({ c2: 'u2', c3: 'u3' });
  });

  it('ignores another board', () => {
    const before = state();
    expect(applyDragging(before, { boardId: 'b2', userId: 'u2', cardId: 'c1' })).toBe(before);
  });
});
