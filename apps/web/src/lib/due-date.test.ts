import { describe, expect, it } from 'vitest';
import { daysUntil, dueStatus } from './due-date';

// Local times, so the tests hold in any time zone. Due dates are stored at local noon.
const at = (date: string, time = '12:00:00') => new Date(`${date}T${time}`).getTime();
const due = (date: string) => new Date(`${date}T12:00:00`).toISOString();

describe('daysUntil', () => {
  it('counts calendar days, not 24-hour periods', () => {
    expect(daysUntil(due('2026-11-11'), at('2026-11-10', '23:59:00'))).toBe(1);
    expect(daysUntil(due('2026-11-10'), at('2026-11-10', '00:01:00'))).toBe(0);
    expect(daysUntil(due('2026-11-09'), at('2026-11-10', '00:01:00'))).toBe(-1);
  });
});

describe('dueStatus', () => {
  const now = at('2026-11-10', '09:00:00');

  it.each([
    ['2026-11-01', 'overdue'],
    ['2026-11-09', 'overdue'],
    ['2026-11-10', 'today'],
    ['2026-11-11', 'soon'],
    ['2026-11-13', 'soon'],
    ['2026-11-14', 'later'],
    ['2026-12-25', 'later'],
  ])('a card due %s is %s', (date, status) => {
    expect(dueStatus(due(date), now)).toBe(status);
  });

  it('still says "today" after the due time has passed on the day', () => {
    expect(dueStatus(due('2026-11-10'), at('2026-11-10', '18:00:00'))).toBe('today');
  });
});
