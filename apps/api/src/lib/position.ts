import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';
import { mongo } from 'mongoose';
import { Conflict } from './errors.js';

export const STALE_ORDER_MESSAGE =
  'The order changed while you were editing. Refresh and try again.';

const MAX_POSITION_ATTEMPTS = 5;
// Retries pick one of this many keys above the collision (see writeAtPosition).
const RETRY_SPREAD = 10;

/**
 * A position string that sorts strictly between `before` and `after` (null = open end).
 * Positions compare as plain strings, which is also how MongoDB sorts them.
 */
export function positionBetween(before: string | null, after: string | null): string {
  // fractional-indexing 4 accepts its bounds in either order, so it cannot tell us that the
  // caller's neighbours are out of date. Bounds out of order mean someone moved them first.
  if (before !== null && after !== null && before >= after) {
    throw new Conflict(STALE_ORDER_MESSAGE);
  }
  return generateKeyBetween(before, after);
}

/**
 * Writes a document at a fresh position between `before` and `after`. Positions are unique
 * per list (ADR 007): if another write or an archived item already holds the key, retry above
 * it, which still sorts before `after`.
 */
export async function writeAtPosition<T>(
  before: string | null,
  after: string | null,
  write: (position: string) => Promise<T>,
): Promise<T> {
  let position = positionBetween(before, after);
  for (let attempt = 1; ; attempt++) {
    try {
      return await write(position);
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
      if (attempt >= MAX_POSITION_ATTEMPTS) {
        throw new Conflict('Too many changes at once in this spot. Try again.');
      }
      // Writers that collided all retry from the same key. A random pick spreads them out;
      // stepping up one key each would just make them collide again in a line.
      position = randomKeyBetween(position, after);
    }
  }
}

function randomKeyBetween(lower: string, upper: string | null): string {
  const keys = generateNKeysBetween(lower, upper, RETRY_SPREAD);
  const key = keys[Math.floor(Math.random() * keys.length)];
  if (key === undefined) throw new Error('generateNKeysBetween returned no keys');
  return key;
}

/**
 * A filter matching positions strictly between `before` and `after`. With both open it is
 * empty, so it matches every position (`{ position: {} }` would match none).
 */
export function positionGap(
  before: string | null,
  after: string | null,
): { position?: { $gt?: string; $lt?: string } } {
  if (before === null && after === null) return {};
  return {
    position: {
      ...(before !== null && { $gt: before }),
      ...(after !== null && { $lt: after }),
    },
  };
}

function isDuplicateKeyError(err: unknown): boolean {
  return err instanceof mongo.MongoServerError && err.code === 11000;
}
