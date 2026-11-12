import { z } from 'zod';
import { objectIdSchema } from './boards.js';

const PAGE_MAX = 50;

/**
 * Newest first. `cursor` is the id of the last item of the previous page; the next page holds
 * the items with a smaller id (ADR 014).
 */
export const cursorQuerySchema = z.object({
  cursor: objectIdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(PAGE_MAX).default(20),
});

/** `null` on the last page. */
export const nextCursorSchema = z.string().nullable();

export type CursorQuery = z.infer<typeof cursorQuerySchema>;
