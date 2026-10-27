import { z } from 'zod';
import { roleSchema } from './roles.js';

export const objectIdSchema = z.string().regex(/^[0-9a-f]{24}$/i, 'Invalid id');

export const DEFAULT_BOARD_COLOR = '#2563eb';
export const hexColorSchema = z.string().regex(/^#[0-9a-f]{6}$/i, 'Use a hex color like #2563eb');
const titleSchema = z.string().trim().min(1).max(100);

// Requests

export const createBoardSchema = z.object({
  title: titleSchema,
  color: hexColorSchema.default(DEFAULT_BOARD_COLOR),
});

export const updateBoardSchema = z
  .object({ title: titleSchema.optional(), color: hexColorSchema.optional() })
  .refine((body) => body.title !== undefined || body.color !== undefined, {
    message: 'Provide a title or a color',
  });

export const createListSchema = z.object({ title: titleSchema });
export const renameListSchema = createListSchema;

/** The items that will sit directly before and after the moved one. */
export const neighboursSchema = z.object({
  beforeId: objectIdSchema.optional(),
  afterId: objectIdSchema.optional(),
});

// A list always moves relative to another list; a card can also move into an empty list (2.3).
export const moveListSchema = neighboursSchema.refine(
  (body) => body.beforeId !== undefined || body.afterId !== undefined,
  { message: 'Provide beforeId, afterId or both' },
);

export type CreateBoardInput = z.infer<typeof createBoardSchema>;
export type UpdateBoardInput = z.infer<typeof updateBoardSchema>;
export type CreateListInput = z.infer<typeof createListSchema>;
export type RenameListInput = z.infer<typeof renameListSchema>;
export type MoveListInput = z.infer<typeof moveListSchema>;

// Responses

export const boardSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  color: z.string(),
  role: roleSchema,
  updatedAt: z.iso.datetime(),
});

export const boardListResponseSchema = z.object({ boards: z.array(boardSummarySchema) });

export const boardMemberDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: roleSchema,
});

export const listDtoSchema = z.object({
  id: z.string(),
  boardId: z.string(),
  title: z.string(),
  position: z.string(),
});

export const cardDtoSchema = z.object({
  id: z.string(),
  boardId: z.string(),
  listId: z.string(),
  title: z.string(),
  description: z.string(),
  position: z.string(),
  labels: z.array(z.object({ name: z.string(), color: z.string() })),
  assignees: z.array(z.string()),
  dueDate: z.iso.datetime().nullable(),
  checklist: z.array(z.object({ id: z.string(), text: z.string(), done: z.boolean() })),
  archived: z.boolean(),
});

export const boardDetailSchema = z.object({
  board: z.object({
    id: z.string(),
    title: z.string(),
    color: z.string(),
    myRole: roleSchema,
    members: z.array(boardMemberDtoSchema),
  }),
  lists: z.array(listDtoSchema),
  cards: z.array(cardDtoSchema),
});

export type BoardSummary = z.infer<typeof boardSummarySchema>;
export type BoardMemberDto = z.infer<typeof boardMemberDtoSchema>;
export type ListDto = z.infer<typeof listDtoSchema>;
export type CardDto = z.infer<typeof cardDtoSchema>;
export type BoardDetail = z.infer<typeof boardDetailSchema>;
