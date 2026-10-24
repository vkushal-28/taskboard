import { generateKeyBetween } from 'fractional-indexing';
import { Conflict } from './errors.js';

export const STALE_ORDER_MESSAGE =
  'The order changed while you were editing. Refresh and try again.';

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
