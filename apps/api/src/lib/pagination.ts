import { Types } from 'mongoose';

/** The filter for the page after `cursor`: newest first, so only smaller ids (ADR 014). */
export function idsBefore(cursor: string | undefined): { _id?: { $lt: Types.ObjectId } } {
  return cursor === undefined ? {} : { _id: { $lt: new Types.ObjectId(cursor) } };
}

/**
 * Splits `limit + 1` rows into one page and the cursor for the next one. The extra row only
 * shows that another page exists; it is not returned.
 */
export function toPage<T extends { _id: Types.ObjectId }>(
  rows: T[],
  limit: number,
): { items: T[]; nextCursor: string | null } {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return { items, nextCursor: rows.length > limit && last ? last._id.toString() : null };
}
