import { describe, expect, it } from 'vitest';
import { Conflict } from './errors.js';
import { positionBetween } from './position.js';

describe('positionBetween', () => {
  it('creates a first position on an empty list', () => {
    expect(positionBetween(null, null)).toBe('a0');
  });

  it('sorts after `before` at the end', () => {
    expect(positionBetween('a0', null) > 'a0').toBe(true);
  });

  it('sorts before `after` at the start', () => {
    expect(positionBetween(null, 'a0') < 'a0').toBe(true);
  });

  it('sorts strictly between two neighbours', () => {
    const position = positionBetween('a0', 'a1');
    expect(position > 'a0' && position < 'a1').toBe(true);
  });

  it('keeps finding room after many inserts into the same gap', () => {
    let after = 'a1';
    for (let i = 0; i < 50; i++) {
      const position = positionBetween('a0', after);
      expect(position > 'a0' && position < after).toBe(true);
      after = position;
    }
  });

  it.each([
    ['a1', 'a0'],
    ['a0', 'a0'],
  ])('rejects neighbours out of order (%s, %s) as a conflict', (before, after) => {
    expect(() => positionBetween(before, after)).toThrow(Conflict);
  });
});
