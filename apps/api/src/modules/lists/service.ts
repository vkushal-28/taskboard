import type { CreateListInput, ListDto, MoveListInput, RenameListInput } from '@taskboard/shared';
import { Conflict, NotFound, ValidationError } from '../../lib/errors.js';
import { positionBetween, STALE_ORDER_MESSAGE } from '../../lib/position.js';
import { logActivity } from '../activity/service.js';
import { CardModel } from '../cards/model.js';
import { ListModel, toListDto } from './model.js';

export async function createList(
  boardId: string,
  actorId: string,
  input: CreateListInput,
): Promise<ListDto> {
  const last = await ListModel.findOne({ boardId }, { position: 1 }).sort({ position: -1 }).lean();
  const list = await ListModel.create({
    boardId,
    title: input.title,
    position: positionBetween(last?.position ?? null, null),
  });

  await logActivity({
    boardId,
    actorId,
    type: 'list.created',
    meta: { listId: list.id, title: list.title },
  });
  return toListDto(list);
}

export async function renameList(
  boardId: string,
  listId: string,
  actorId: string,
  input: RenameListInput,
): Promise<ListDto> {
  const list = await ListModel.findOneAndUpdate(
    { _id: listId, boardId },
    { title: input.title },
    { returnDocument: 'after' },
  ).lean();
  if (!list) throw new NotFound('List not found');

  await logActivity({
    boardId,
    actorId,
    type: 'list.renamed',
    meta: { listId, title: list.title },
  });
  return toListDto(list);
}

export async function moveList(
  boardId: string,
  listId: string,
  actorId: string,
  input: MoveListInput,
): Promise<ListDto> {
  if (input.beforeId === listId || input.afterId === listId) {
    throw new ValidationError(undefined, 'A list cannot be its own neighbour');
  }

  const [before, after] = await Promise.all([
    neighbourPosition(boardId, input.beforeId),
    neighbourPosition(boardId, input.afterId),
  ]);
  const position = positionBetween(before, after);

  // Another list sitting between the neighbours means the client's order is out of date:
  // moving "between A and C" would silently land on the wrong side of B.
  const gap: { $gt?: string; $lt?: string } = {};
  if (before !== null) gap.$gt = before;
  if (after !== null) gap.$lt = after;
  if (await ListModel.exists({ boardId, _id: { $ne: listId }, position: gap })) {
    throw new Conflict(STALE_ORDER_MESSAGE);
  }

  const list = await ListModel.findOneAndUpdate(
    { _id: listId, boardId },
    { position },
    { returnDocument: 'after' },
  ).lean();
  if (!list) throw new NotFound('List not found');

  await logActivity({ boardId, actorId, type: 'list.moved', meta: { listId } });
  return toListDto(list);
}

export async function deleteList(boardId: string, listId: string, actorId: string): Promise<void> {
  const list = await ListModel.findOneAndDelete({ _id: listId, boardId }).lean();
  if (!list) throw new NotFound('List not found');
  await CardModel.deleteMany({ listId });

  await logActivity({
    boardId,
    actorId,
    type: 'list.deleted',
    meta: { listId, title: list.title },
  });
}

/** A neighbour that is missing or on another board means the client's view is stale. */
async function neighbourPosition(
  boardId: string,
  listId: string | undefined,
): Promise<string | null> {
  if (listId === undefined) return null;
  const list = await ListModel.findOne({ _id: listId, boardId }, { position: 1 }).lean();
  if (!list) throw new Conflict(STALE_ORDER_MESSAGE);
  return list.position;
}
