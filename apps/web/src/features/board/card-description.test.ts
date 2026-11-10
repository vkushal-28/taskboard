import { describe, expect, it } from 'vitest';
import { card, MEMBER } from '../../test/board-fixtures';
import { describeCard } from './card-description';

const now = new Date('2026-11-10T09:00:00').getTime();
const noonOn = (date: string) => new Date(`${date}T12:00:00`).toISOString();

describe('describeCard', () => {
  it('is empty for a card with only a title', () => {
    expect(describeCard(card('c1', 'l1', 'a0'), [], now)).toBe('');
  });

  it('reads what the tile shows, in the order it shows it', () => {
    const full = card('c1', 'l1', 'a0', {
      labels: [
        { name: 'Design', color: '#7c3aed' },
        { name: 'High priority', color: '#dc2626' },
      ],
      dueDate: noonOn('2026-11-20'),
      checklist: [
        { id: 'i1', text: 'One', done: true },
        { id: 'i2', text: 'Two', done: false },
      ],
      commentCount: 1,
    });

    expect(describeCard(full, [MEMBER], now)).toBe(
      'Labels: Design, High priority. Due November 20. Checklist 1 of 2 done. 1 comment. ' +
        'Assigned to Alex Kim.',
    );
  });

  it('says when a card is overdue or due today', () => {
    expect(describeCard(card('c1', 'l1', 'a0', { dueDate: noonOn('2026-11-08') }), [], now)).toBe(
      'Overdue, November 8.',
    );
    expect(describeCard(card('c1', 'l1', 'a0', { dueDate: noonOn('2026-11-10') }), [], now)).toBe(
      'Due today, November 10.',
    );
  });
});
