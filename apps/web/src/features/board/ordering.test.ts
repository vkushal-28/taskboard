import { describe, expect, it } from 'vitest';
import { boardDetail, card } from '../../test/board-fixtures';
import { applyMove, dropOrder, groupCards, planMove, type MovePlan } from './ordering';

function columnsAfter(plan: MovePlan | null) {
  if (!plan) throw new Error('expected a move');
  return groupCards(applyMove(boardDetail(), plan));
}

describe('groupCards', () => {
  it('groups cards by list in position order, with empty lists present', () => {
    expect(groupCards(boardDetail())).toEqual({ l1: ['c1', 'c2', 'c3'], l2: ['c4'], l3: [] });
  });

  it('breaks position ties by id, like the api', () => {
    const detail = { ...boardDetail(), cards: [card('cb', 'l1', 'a0'), card('ca', 'l1', 'a0')] };
    expect(groupCards(detail).l1).toEqual(['ca', 'cb']);
  });
});

describe('planMove', () => {
  it('moves a card down within its list', () => {
    const plan = planMove(boardDetail(), 'c1', 'l1', 2);

    expect(plan).toMatchObject({ listId: 'l1', beforeId: 'c3', afterId: undefined });
    expect(columnsAfter(plan).l1).toEqual(['c2', 'c3', 'c1']);
  });

  it('moves a card up to the top of its list', () => {
    const plan = planMove(boardDetail(), 'c3', 'l1', 0);

    expect(plan).toMatchObject({ beforeId: undefined, afterId: 'c1' });
    expect(columnsAfter(plan).l1).toEqual(['c3', 'c1', 'c2']);
  });

  it('moves a card between two cards of another list', () => {
    const detail = boardDetail();
    detail.cards.push(card('c5', 'l2', 'a1'));
    const plan = planMove(detail, 'c2', 'l2', 1);

    expect(plan).toMatchObject({ listId: 'l2', beforeId: 'c4', afterId: 'c5' });
    if (!plan) throw new Error('expected a move');
    expect(plan.position > 'a0' && plan.position < 'a1').toBe(true);
    expect(groupCards(applyMove(detail, plan))).toMatchObject({
      l1: ['c1', 'c3'],
      l2: ['c4', 'c2', 'c5'],
    });
  });

  it('moves a card into an empty list with no neighbours', () => {
    const plan = planMove(boardDetail(), 'c4', 'l3', 0);

    expect(plan).toMatchObject({ listId: 'l3', beforeId: undefined, afterId: undefined });
    expect(columnsAfter(plan)).toMatchObject({ l2: [], l3: ['c4'] });
  });

  it('clamps an index past the end to the last slot', () => {
    expect(planMove(boardDetail(), 'c4', 'l1', 99)).toMatchObject({
      beforeId: 'c3',
      afterId: undefined,
    });
  });

  it('returns null when the card is dropped where it already was', () => {
    expect(planMove(boardDetail(), 'c2', 'l1', 1)).toBeNull();
  });

  it('returns null for an unknown card or list', () => {
    expect(planMove(boardDetail(), 'nope', 'l1', 0)).toBeNull();
    expect(planMove(boardDetail(), 'c1', 'nope', 0)).toBeNull();
  });
});

describe('dropOrder', () => {
  const ids = ['c1', 'c2', 'c3'];

  it.each([
    ['down onto a later card', 'c1', 'c3', ['c2', 'c3', 'c1']],
    ['up onto an earlier card', 'c3', 'c1', ['c3', 'c1', 'c2']],
    ['onto itself', 'c2', 'c2', ['c1', 'c2', 'c3']],
  ])('takes the slot of the card it was dropped on (%s)', (_case, cardId, overId, expected) => {
    expect(dropOrder(ids, cardId, overId, false)).toEqual(expected);
  });

  it('puts the card last when it is dropped on the list itself', () => {
    expect(dropOrder(ids, 'c1', 'l1', true)).toEqual(['c2', 'c3', 'c1']);
    expect(dropOrder(ids, 'c3', 'l1', true)).toEqual(ids);
  });

  it('leaves the order alone when the card or the drop target is not in the list', () => {
    expect(dropOrder(ids, 'c9', 'c1', false)).toEqual(ids);
    expect(dropOrder(ids, 'c1', 'c9', false)).toEqual(ids);
  });
});
