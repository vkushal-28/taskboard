import type { ActivityItem, ActivityType } from '@taskboard/shared';
import { describe, expect, it } from 'vitest';
import { describeActivity, describeCardFields } from './describe';

function item(type: ActivityType, names: { card?: string; list?: string } = {}): ActivityItem {
  return {
    id: 'a1',
    type,
    createdAt: '2026-10-27T12:00:00.000Z',
    actor: { id: 'u1', name: 'Priya' },
    board: { id: 'b1', title: 'Website Redesign', color: '#2563eb' },
    card: names.card ? { id: 'c1', title: names.card } : null,
    list: names.list ? { id: 'l1', title: names.list } : null,
  };
}

const both = { card: 'Login page', list: 'Done' };

describe('describeActivity', () => {
  it.each<[ActivityType, string]>([
    ['board.created', 'created the board'],
    ['board.updated', 'updated the board'],
    ['list.created', 'added list "Done"'],
    ['list.renamed', 'renamed a list to "Done"'],
    ['list.moved', 'reordered list "Done"'],
    ['list.deleted', 'deleted list "Done"'],
    ['card.created', 'added "Login page" to "Done"'],
    ['card.updated', 'updated "Login page"'],
    ['card.moved', 'moved "Login page" to "Done"'],
    ['card.archived', 'archived "Login page"'],
    ['card.restored', 'restored "Login page"'],
    ['card.deleted', 'deleted "Login page"'],
  ])('%s reads "%s"', (type, sentence) => {
    expect(describeActivity(item(type, both))).toBe(sentence);
  });

  it('falls back to "a card" and "a list" when the names are gone', () => {
    expect(describeActivity(item('card.moved'))).toBe('moved a card to a list');
  });
});

describe('describeCardFields', () => {
  it.each<[Parameters<typeof describeCardFields>[0], string | null]>([
    [['dueDate'], 'the due date'],
    [['title', 'description'], 'the title and description'],
    [['labels', 'assignees', 'checklist'], 'the labels, members and checklist'],
    [['checklist', 'checklist'], 'the checklist'],
    [[], null],
    [undefined, null],
  ])('%j reads %j', (fields, words) => {
    expect(describeCardFields(fields)).toBe(words);
  });

  it('names the fields in the board feed', () => {
    expect(describeActivity({ ...item('card.updated', both), fields: ['assignees'] })).toBe(
      'updated the members of "Login page"',
    );
  });
});
