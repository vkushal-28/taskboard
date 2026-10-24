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
