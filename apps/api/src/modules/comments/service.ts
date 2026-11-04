import type { CardDto, CommentDto, CommentPage, CursorQuery } from '@taskboard/shared';
import { NotFound } from '../../lib/errors.js';
import { idsBefore, toPage } from '../../lib/pagination.js';
import { logActivity } from '../activity/service.js';
import { CardModel, toCardDto } from '../cards/model.js';
import { emitToBoard } from '../realtime/emitter.js';
import { UserModel } from '../users/model.js';
import { CommentModel, toCommentDto } from './model.js';

export async function listComments(
  boardId: string,
  cardId: string,
  { cursor, limit }: CursorQuery,
): Promise<CommentPage> {
  const rows = await CommentModel.find({ boardId, cardId, ...idsBefore(cursor) })
    .sort({ _id: -1 })
    .limit(limit + 1)
    .lean();
  const { items, nextCursor } = toPage(rows, limit);

  const authorIds = [...new Set(items.map((comment) => comment.authorId.toString()))];
  const authors = await UserModel.find({ _id: { $in: authorIds } }, { name: 1 }).lean();
  const names = new Map(authors.map((user) => [user._id.toString(), user.name]));
  return {
    comments: items.map((comment) => toCommentDto(comment, names.get(comment.authorId.toString()))),
    nextCursor,
  };
}

export async function addComment(
  boardId: string,
  cardId: string,
  actorId: string,
  body: string,
): Promise<{ comment: CommentDto; card: CardDto }> {
  const created = await CommentModel.create({ boardId, cardId, authorId: actorId, body });
  // Two writes without a transaction (ADR 006): a crash in between leaves the count one low.
  const card = await CardModel.findOneAndUpdate(
    { _id: cardId, boardId },
    { $inc: { commentCount: 1, version: 1 } },
    { returnDocument: 'after' },
  ).lean();
  if (!card) {
    // The card was deleted after the role check; don't leave the comment behind.
    await CommentModel.deleteOne({ _id: created._id });
    throw new NotFound('Card not found');
  }

  const author = await UserModel.findById(actorId, { name: 1 }).lean();
  const comment = toCommentDto(created, author?.name);
  const cardDto = toCardDto(card);
  await logActivity({
    boardId,
    actorId,
    cardId,
    type: 'comment.created',
    meta: { commentId: comment.id },
  });
  emitToBoard(boardId, 'card:updated', { boardId, actorId, card: cardDto });
  emitToBoard(boardId, 'comment:created', { boardId, actorId, comment });
  return { comment, card: cardDto };
}
