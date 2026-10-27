import { describe, expect, it } from 'vitest';
import { formatRelative, greetingFor } from './time';

const NOW = Date.parse('2026-10-27T12:00:00Z');
const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString();

describe('formatRelative', () => {
  it.each([
    [0, 'just now'],
    [59, 'just now'],
    [60, '1 minute ago'],
    [5 * 60, '5 minutes ago'],
    [3 * 3600, '3 hours ago'],
    [24 * 3600, 'yesterday'],
    [14 * 24 * 3600, '2 weeks ago'],
    [400 * 24 * 3600, 'last year'],
  ])('%i seconds ago is "%s"', (seconds, expected) => {
    expect(formatRelative(ago(seconds), NOW)).toBe(expected);
  });
});

describe('greetingFor', () => {
  it.each([
    [6, 'Good morning'],
    [12, 'Good afternoon'],
    [17, 'Good afternoon'],
    [18, 'Good evening'],
  ])('at %i:00 says "%s"', (hour, expected) => {
    expect(greetingFor(new Date(2026, 9, 27, hour))).toBe(expected);
  });
});
