import type { BoardEventName } from '@taskboard/shared';
import { describe, expect, it } from 'vitest';
import { boardDetail, card, list } from '../../test/board-fixtures';
import {
  applyBoardEvent,
  cardIdOf,
  describeRemoteMove,
  parseBoardEvent,
  type BoardEvent,
} from './live-events';
import { groupCards } from './ordering';

const base = { boardId: 'b1', actorId: 'u2' };

function event(name: BoardEventName, payload: object): BoardEvent {
  const parsed = parseBoardEvent(name, { ...base, ...payload });
  if (!parsed) throw new Error(`invalid ${name} payload`);
  return parsed;
}

// Applying an event twice must give the same board: the user's own events arrive too.
function applyTwice(e: BoardEvent) {
  const once = applyBoardEvent(boardDetail(), e);
  expect(applyBoardEvent(once, e)).toEqual(once);
  return once;
}

describe('parseBoardEvent', () => {
  it('drops a payload that does not match the shared schema', () => {
    expect(parseBoardEvent('card:created', { ...base, card: { id: 'c9' } })).toBeNull();
    expect(parseBoardEvent('card:deleted', { cardId: 'c1', listId: 'l1' })).toBeNull();
  });
});

describe('applyBoardEvent', () => {
  it('adds a created card once', () => {
    const next = applyTwice(event('card:created', { card: card('c9', 'l3', 'a0') }));
    expect(groupCards(next).l3).toEqual(['c9']);
  });

  it('replaces an updated card', () => {
    const next = applyTwice(
      event('card:updated', { card: card('c1', 'l1', 'a0', { title: 'New' }) }),
    );
    expect(next.cards.find((c) => c.id === 'c1')?.title).toBe('New');
    expect(next.cards).toHaveLength(4);
  });

  it('removes a card that was archived and adds back one that was restored', () => {
    const archived = applyTwice(
      event('card:updated', { card: card('c1', 'l1', 'a0', { archived: true }) }),
    );
    expect(archived.cards.map((c) => c.id)).not.toContain('c1');

    const restored = applyBoardEvent(
      archived,
      event('card:updated', { card: card('c1', 'l1', 'a0') }),
    );
    expect(groupCards(restored).l1).toEqual(['c1', 'c2', 'c3']);
  });

  it('moves a card to its new list and position', () => {
    const next = applyTwice(
      event('card:moved', { card: card('c1', 'l2', 'a1'), fromListId: 'l1' }),
    );
    expect(groupCards(next)).toMatchObject({ l1: ['c2', 'c3'], l2: ['c4', 'c1'] });
  });

  it('adds a moved card this client never saw', () => {
    const next = applyTwice(
      event('card:moved', { card: card('c9', 'l3', 'a0'), fromListId: 'l1' }),
    );
    expect(groupCards(next).l3).toEqual(['c9']);
  });

  it('removes a deleted card', () => {
    const next = applyTwice(event('card:deleted', { cardId: 'c2', listId: 'l1' }));
    expect(groupCards(next).l1).toEqual(['c1', 'c3']);
  });

  it('adds, renames and moves lists', () => {
    const created = applyTwice(event('list:created', { list: list('l4', 'Review', 'a3') }));
    expect(created.lists.map((l) => l.id)).toContain('l4');

    const renamed = applyTwice(event('list:updated', { list: list('l1', 'Backlog', 'a0') }));
    expect(renamed.lists.find((l) => l.id === 'l1')?.title).toBe('Backlog');

    const moved = applyTwice(event('list:moved', { list: list('l1', 'To Do', 'a5') }));
    expect(moved.lists.find((l) => l.id === 'l1')?.position).toBe('a5');
  });

  it('removes a deleted list together with its cards', () => {
    const next = applyTwice(event('list:deleted', { listId: 'l1' }));
    expect(next.lists.map((l) => l.id)).toEqual(['l2', 'l3']);
    expect(next.cards.map((c) => c.id)).toEqual(['c4']);
  });

  it('renames and recolours the board but keeps my role and the members', () => {
    const next = applyTwice(
      event('board:updated', { board: { id: 'b1', title: 'Launch', color: '#16a34a' } }),
    );
    expect(next.board).toEqual({ ...boardDetail().board, title: 'Launch', color: '#16a34a' });
  });
});

describe('cardIdOf', () => {
  it('names the card an event changes', () => {
    expect(cardIdOf(event('card:moved', { card: card('c1', 'l2', 'a1'), fromListId: 'l1' }))).toBe(
      'c1',
    );
    expect(cardIdOf(event('card:deleted', { cardId: 'c2', listId: 'l1' }))).toBe('c2');
    expect(cardIdOf(event('list:deleted', { listId: 'l1' }))).toBeUndefined();
  });
});

describe('describeRemoteMove', () => {
  const moved = (listId: string, fromListId: string, actorId = 'u2') => ({
    boardId: 'b1',
    actorId,
    card: card('c1', listId, 'a5', { title: 'Homepage' }),
    fromListId,
  });

  it('names the mover, the card and the target list', () => {
    expect(describeRemoteMove(boardDetail(), moved('l3', 'l1'))).toBe(
      'Alex Kim moved "Homepage" to Done',
    );
  });

  it('stays quiet for a reorder within one list', () => {
    expect(describeRemoteMove(boardDetail(), moved('l1', 'l1'))).toBeNull();
  });

  it('falls back to "Someone" for a mover the board does not list', () => {
    expect(describeRemoteMove(boardDetail(), moved('l3', 'l1', 'u9'))).toBe(
      'Someone moved "Homepage" to Done',
    );
  });
});
