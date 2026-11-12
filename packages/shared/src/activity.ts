import { z } from 'zod';
import { nextCursorSchema } from './pagination.js';

const activityTypeSchema = z.enum([
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
  'comment.created',
  'member.invited',
  'member.invite_revoked',
  'member.joined',
  'member.role_changed',
  'member.removed',
]);

export type ActivityType = z.infer<typeof activityTypeSchema>;
export const ACTIVITY_TYPES = activityTypeSchema.options;

// The card fields a `card.updated` entry names, so a feed can say "updated the due date".
export const cardFieldSchema = z.enum([
  'title',
  'description',
  'labels',
  'assignees',
  'dueDate',
  'checklist',
]);

export type CardField = z.infer<typeof cardFieldSchema>;

const RECENT_ACTIVITY_MAX = 50;

export const recentActivityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(RECENT_ACTIVITY_MAX).default(10),
});

// Display-ready: the server resolves names and titles, so the client never joins ids itself.
// `card` and `list` fall back to the title saved at delete time, and are null when neither the
// document nor a saved title exists.
const activityItemSchema = z.object({
  id: z.string(),
  type: activityTypeSchema,
  createdAt: z.iso.datetime(),
  actor: z.object({ id: z.string(), name: z.string() }).nullable(),
  board: z.object({ id: z.string(), title: z.string(), color: z.string() }),
  card: z.object({ id: z.string(), title: z.string() }).nullable(),
  list: z.object({ id: z.string(), title: z.string() }).nullable(),
  // Only on `card.updated`: what changed (empty for entries logged without it).
  fields: z.array(cardFieldSchema).optional(),
});

export const recentActivityResponseSchema = z.object({ activity: z.array(activityItemSchema) });

// The board and card feeds: newest first, one page at a time (ADR 014).
export const activityPageSchema = z.object({
  activity: z.array(activityItemSchema),
  nextCursor: nextCursorSchema,
});

export type ActivityItem = z.infer<typeof activityItemSchema>;
export type ActivityPage = z.infer<typeof activityPageSchema>;
