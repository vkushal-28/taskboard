import { z } from 'zod';
import { hexColorSchema, neighboursSchema, objectIdSchema } from './boards.js';

const cardTitleSchema = z.string().trim().min(1).max(200);
const descriptionSchema = z.string().max(5000);
const checklistTextSchema = z.string().trim().min(1).max(200);
export const CHECKLIST_MAX_ITEMS = 50;

const labelSchema = z.object({ name: z.string().trim().min(1).max(30), color: hexColorSchema });

// Items sent with an id keep it; new items get one from the server.
const checklistItemInputSchema = z.object({
  id: objectIdSchema.optional(),
  text: checklistTextSchema,
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
    checklist: z.array(checklistItemInputSchema).max(CHECKLIST_MAX_ITEMS).optional(),
    archived: z.boolean().optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'Provide at least one field to update',
  });

// Per-item checklist writes are single atomic updates, so two people ticking different items
// at the same moment never overwrite each other (ADR 013).

export const addChecklistItemSchema = z.object({ text: checklistTextSchema });

export const updateChecklistItemSchema = z
  .object({ text: checklistTextSchema.optional(), done: z.boolean().optional() })
  .refine((body) => body.text !== undefined || body.done !== undefined, {
    message: 'Provide text or done',
  });

/** No neighbours means "into an empty list". */
export const moveCardSchema = neighboursSchema.extend({ listId: objectIdSchema });

export type CreateCardInput = z.infer<typeof createCardSchema>;
export type UpdateCardInput = z.infer<typeof updateCardSchema>;
export type MoveCardInput = z.infer<typeof moveCardSchema>;
export type AddChecklistItemInput = z.infer<typeof addChecklistItemSchema>;
export type UpdateChecklistItemInput = z.infer<typeof updateChecklistItemSchema>;
