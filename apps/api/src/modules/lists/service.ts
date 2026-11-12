import type { CreateListInput, ListDto, MoveListInput, RenameListInput } from '@taskboard/shared';
import { Conflict, NotFound, ValidationError } from '../../lib/errors.js';
import { positionGap, STALE_ORDER_MESSAGE, writeAtPosition } from '../../lib/position.js';
import { recordWrite } from '../activity/record-write.js';
import { CardModel } from '../cards/model.js';
import { CommentModel } from '../comments/model.js';
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

  const dto = toListDto(list);
  await recordWrite(
    { boardId, actorId, type: 'list.created', meta: { listId: list.id, title: list.title } },
    'list:created',
    { boardId, actorId, list: dto },
  );
  return dto;
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

  const dto = toListDto(list);
  await recordWrite(
    { boardId, actorId, type: 'list.renamed', meta: { listId, title: list.title } },
    'list:updated',
    { boardId, actorId, list: dto },
  );
  return dto;
}

export async function moveList(
  boardId: string,
  listId: string,
  actorId: string,
  input: MoveListInput,
): Promise<ListDto> {
  if (input.beforeId === listId || input.afterId === listId) {
    throw ValidationError.because('A list cannot be its own neighbour');
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

  const dto = toListDto(list);
  await recordWrite({ boardId, actorId, type: 'list.moved', meta: { listId } }, 'list:moved', {
    boardId,
    actorId,
    list: dto,
  });
  return dto;
}

export async function deleteList(boardId: string, listId: string, actorId: string): Promise<void> {
  const list = await ListModel.findOne({ _id: listId, boardId }, { title: 1 }).lean();
  if (!list) throw new NotFound('List not found');
  // Cards first (ADR 006): a crash in between leaves a list that is still shown and can be
  // deleted again, not cards whose list is gone. boardId lets the query use the cards index.
  const cards = await CardModel.find({ boardId, listId }, { _id: 1 }).lean();
  await CardModel.deleteMany({ boardId, listId });
  await ListModel.deleteOne({ _id: listId, boardId });
  // Comments last: once their cards are gone, nothing can reach them.
  await CommentModel.deleteMany({ boardId, cardId: { $in: cards.map((card) => card._id) } });

  await recordWrite(
    { boardId, actorId, type: 'list.deleted', meta: { listId, title: list.title } },
    'list:deleted',
    { boardId, actorId, listId },
  );
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
