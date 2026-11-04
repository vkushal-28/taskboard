import { z } from 'zod';
import { cardDtoSchema } from './boards.js';
import { nextCursorSchema } from './pagination.js';

export const COMMENT_MAX_LENGTH = 5000;

export const createCommentSchema = z.object({
  body: z.string().trim().min(1, 'Write a comment first').max(COMMENT_MAX_LENGTH),
});

// `author` is resolved by the server, and null once the user no longer exists.
export const commentDtoSchema = z.object({
  id: z.string(),
  boardId: z.string(),
  cardId: z.string(),
  author: z.object({ id: z.string(), name: z.string() }).nullable(),
  body: z.string(),
  createdAt: z.iso.datetime(),
});

export const commentPageSchema = z.object({
  comments: z.array(commentDtoSchema),
  nextCursor: nextCursorSchema,
});

// The card comes back too: its commentCount and version changed with the comment.
export const createCommentResponseSchema = z.object({
  comment: commentDtoSchema,
  card: cardDtoSchema,
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type CommentDto = z.infer<typeof commentDtoSchema>;
export type CommentPage = z.infer<typeof commentPageSchema>;
