import type { CreateListInput, ListDto, MoveListInput, RenameListInput } from '@taskboard/shared';
import { Conflict, NotFound, ValidationError } from '../../lib/errors.js';
import { positionGap, STALE_ORDER_MESSAGE, writeAtPosition } from '../../lib/position.js';
import { logActivity } from '../activity/service.js';
import { CardModel } from '../cards/model.js';
import { ListModel, toListDto } from './model.js';

export async function createList(
  boardId: string,
  actorId: string,
  input: CreateListInput,
): Promise<ListDto> {
  const last = await ListModel.findOne({ boardId }, { position: 1 }).sort({ position: -1 }).lean();
  const list = await writeAtPosition(last?.position ?? null, null, (position) =>
    ListModel.create({ boardId, title: input.title, position }),
  );

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
  // Another list sitting between the neighbours means the client's order is out of date:
  // moving "between A and C" would silently land on the wrong side of B.
  if (await ListModel.exists({ boardId, _id: { $ne: listId }, ...positionGap(before, after) })) {
    throw new Conflict(STALE_ORDER_MESSAGE);
  }

  const list = await writeAtPosition(before, after, (position) =>
    ListModel.findOneAndUpdate(
      { _id: listId, boardId },
      { position },
      { returnDocument: 'after' },
    ).lean(),
  );
  if (!list) throw new NotFound('List not found');

  await logActivity({ boardId, actorId, type: 'list.moved', meta: { listId } });
  return toListDto(list);
}

export async function deleteList(boardId: string, listId: string, actorId: string): Promise<void> {
  const list = await ListModel.findOne({ _id: listId, boardId }, { title: 1 }).lean();
  if (!list) throw new NotFound('List not found');
  // Cards first (ADR 006): a crash in between leaves a list that is still shown and can be
  // deleted again, not cards whose list is gone. boardId lets the query use the cards index.
  await CardModel.deleteMany({ boardId, listId });
  await ListModel.deleteOne({ _id: listId, boardId });

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
