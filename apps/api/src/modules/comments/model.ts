import type { CommentDto } from '@taskboard/shared';
import { model, Schema, type Types } from 'mongoose';

export interface Comment {
  boardId: Types.ObjectId;
  cardId: Types.ObjectId;
  authorId: Types.ObjectId;
  body: string;
  createdAt: Date;
}

const commentSchema = new Schema<Comment>(
  {
    boardId: { type: Schema.Types.ObjectId, ref: 'Board', required: true },
    cardId: { type: Schema.Types.ObjectId, ref: 'Card', required: true },
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// One index for every query: a card's page (newest first), a card's cascade and a board's
// cascade. That's why every comment query names its board.
commentSchema.index({ boardId: 1, cardId: 1, _id: -1 });

export const CommentModel = model<Comment>('Comment', commentSchema);

/** The JSON shape of a comment that the api sends to clients, with the author's name. */
export function toCommentDto(
  comment: Comment & { _id: Types.ObjectId },
  authorName: string | undefined,
): CommentDto {
  const authorId = comment.authorId.toString();
  return {
    id: comment._id.toString(),
    boardId: comment.boardId.toString(),
    cardId: comment.cardId.toString(),
    author: authorName === undefined ? null : { id: authorId, name: authorName },
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
  };
}
