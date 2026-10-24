import { z } from 'zod';
import { hexColorSchema, neighboursSchema, objectIdSchema } from './boards.js';

const cardTitleSchema = z.string().trim().min(1).max(200);
const descriptionSchema = z.string().max(5000);

const labelSchema = z.object({ name: z.string().trim().min(1).max(30), color: hexColorSchema });

// Items sent with an id keep it; new items get one from the server.
const checklistItemInputSchema = z.object({
  id: objectIdSchema.optional(),
  text: z.string().trim().min(1).max(200),
  done: z.boolean().default(false),
});

export const createCardSchema = z.object({
  title: cardTitleSchema,
  description: descriptionSchema.default(''),
});

export const updateCardSchema = z
  .object({
    title: cardTitleSchema.optional(),
    description: descriptionSchema.optional(),
    labels: z.array(labelSchema).max(10).optional(),
    assignees: z.array(objectIdSchema).max(20).optional(),
    dueDate: z.iso.datetime({ offset: true }).nullable().optional(),
    checklist: z.array(checklistItemInputSchema).max(50).optional(),
    archived: z.boolean().optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'Provide at least one field to update',
  });

/** No neighbours means "into an empty list". */
export const moveCardSchema = neighboursSchema.extend({ listId: objectIdSchema });

export type CreateCardInput = z.infer<typeof createCardSchema>;
export type UpdateCardInput = z.infer<typeof updateCardSchema>;
export type MoveCardInput = z.infer<typeof moveCardSchema>;
