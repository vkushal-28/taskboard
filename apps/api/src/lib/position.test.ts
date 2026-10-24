import { mongo } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import { Conflict } from './errors.js';
import { positionBetween, positionGap, writeAtPosition } from './position.js';

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

function duplicateKeyError() {
  return new mongo.MongoServerError({ message: 'E11000 duplicate key error', code: 11000 });
}

describe('writeAtPosition', () => {
  it('writes at the first free position', async () => {
    const write = vi.fn((position: string) => Promise.resolve(position));
    await expect(writeAtPosition('a0', 'a1', write)).resolves.toBe(positionBetween('a0', 'a1'));
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('retries above a taken key and stays below `after`', async () => {
    const taken = positionBetween('a0', 'a1');
    const write = vi.fn((position: string) =>
      position === taken ? Promise.reject(duplicateKeyError()) : Promise.resolve(position),
    );

    const position = await writeAtPosition('a0', 'a1', write);

    expect(write).toHaveBeenCalledTimes(2);
    expect(position > taken && position < 'a1').toBe(true);
  });

  it('keeps every retry inside the requested gap', async () => {
    const tried: string[] = [];
    const write = vi.fn((position: string) => {
      tried.push(position);
      return tried.length < 5 ? Promise.reject(duplicateKeyError()) : Promise.resolve(position);
    });

    await writeAtPosition('a0', 'a1', write);

    expect(tried.every((position) => position > 'a0' && position < 'a1')).toBe(true);
    expect(new Set(tried).size).toBe(5);
  });

  it('gives up with a conflict after five collisions', async () => {
    const write = vi.fn(() => Promise.reject(duplicateKeyError()));
    await expect(writeAtPosition('a0', 'a1', write)).rejects.toThrow(Conflict);
    expect(write).toHaveBeenCalledTimes(5);
  });

  it('rethrows errors that are not duplicate keys', async () => {
    const write = vi.fn(() => Promise.reject(new Error('db down')));
    await expect(writeAtPosition(null, null, write)).rejects.toThrow('db down');
    expect(write).toHaveBeenCalledTimes(1);
  });
});

describe('positionGap', () => {
  it('matches everything when both ends are open', () => {
    expect(positionGap(null, null)).toEqual({});
  });

  it('bounds each side that is given', () => {
    expect(positionGap('a0', null)).toEqual({ position: { $gt: 'a0' } });
    expect(positionGap(null, 'a1')).toEqual({ position: { $lt: 'a1' } });
    expect(positionGap('a0', 'a1')).toEqual({ position: { $gt: 'a0', $lt: 'a1' } });
  });
});
