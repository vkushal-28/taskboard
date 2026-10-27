import { z } from 'zod';

export const activityTypeSchema = z.enum([
  'board.created',
  'board.updated',
  'list.created',
  'list.renamed',
  'list.moved',
  'list.deleted',
  'card.created',
  'card.updated',
  'card.moved',
  'card.archived',
  'card.restored',
  'card.deleted',
]);

export type ActivityType = z.infer<typeof activityTypeSchema>;
export const ACTIVITY_TYPES = activityTypeSchema.options;

export const RECENT_ACTIVITY_MAX = 50;

export const recentActivityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(RECENT_ACTIVITY_MAX).default(10),
});

// Display-ready: the server resolves names and titles, so the client never joins ids itself.
// `card` and `list` fall back to the title saved at delete time, and are null when neither the
// document nor a saved title exists.
export const activityItemSchema = z.object({
  id: z.string(),
  type: activityTypeSchema,
  createdAt: z.iso.datetime(),
  actor: z.object({ id: z.string(), name: z.string() }).nullable(),
  board: z.object({ id: z.string(), title: z.string(), color: z.string() }),
  card: z.object({ id: z.string(), title: z.string() }).nullable(),
  list: z.object({ id: z.string(), title: z.string() }).nullable(),
});

export const recentActivityResponseSchema = z.object({ activity: z.array(activityItemSchema) });

export type RecentActivityQuery = z.infer<typeof recentActivityQuerySchema>;
export type ActivityItem = z.infer<typeof activityItemSchema>;
