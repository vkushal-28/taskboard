import {
  CHECKLIST_MAX_ITEMS,
  type AddChecklistItemInput,
  type CardDto,
  type CreateCardInput,
  type MoveCardInput,
  type UpdateCardInput,
  type UpdateChecklistItemInput,
} from '@taskboard/shared';
import { Types } from 'mongoose';
import { Conflict, NotFound, ValidationError } from '../../lib/errors.js';
import { positionGap, STALE_ORDER_MESSAGE, writeAtPosition } from '../../lib/position.js';
import { logActivity } from '../activity/service.js';
import { areBoardMembers } from '../boards/access.js';
import { ListModel } from '../lists/model.js';
import { emitToBoard } from '../realtime/emitter.js';
import { CardModel, toCardDto } from './model.js';

export async function createCard(
  boardId: string,
  listId: string,
  actorId: string,
  input: CreateCardInput,
): Promise<CardDto> {
  // After the last card, archived ones included: they still hold their positions. Filtering by
  // boardId as well lets this use the { boardId, listId, position } index.
  const last = await CardModel.findOne({ boardId, listId }, { position: 1 })
    .sort({ position: -1 })
    .lean();
  const card = await writeAtPosition(last?.position ?? null, null, (position) =>
    CardModel.create({ boardId, listId, ...input, position }),
  );

  await logActivity({ boardId, actorId, cardId: card.id, type: 'card.created', meta: { listId } });
  const dto = toCardDto(card);
  emitToBoard(boardId, 'card:created', { boardId, actorId, card: dto });
  return dto;
}

export async function getCard(boardId: string, cardId: string): Promise<CardDto> {
  const card = await CardModel.findOne({ _id: cardId, boardId }).lean();
  if (!card) throw new NotFound('Card not found');
  return toCardDto(card);
}

export async function updateCard(
  boardId: string,
  cardId: string,
  actorId: string,
  input: UpdateCardInput,
): Promise<CardDto> {
  const { assignees, checklist, dueDate, ...plainFields } = input;
  const set: Record<string, unknown> = { ...plainFields };
  if (dueDate !== undefined) set.dueDate = dueDate === null ? null : new Date(dueDate);
  if (assignees !== undefined) {
    const uniqueIds = [...new Set(assignees)];
    if (!(await areBoardMembers(boardId, uniqueIds))) {
      throw new ValidationError(undefined, 'Assignees must be members of the board');
    }
    set.assignees = uniqueIds.map((userId) => new Types.ObjectId(userId));
  }
  if (checklist !== undefined) {
    // Items sent with an id keep it, so the client can keep tracking them across saves.
    set.checklist = checklist.map(({ id, text, done }) =>
      id ? { _id: id, text, done } : { text, done },
    );
  }

  // Only to tell whether archiving changed, for the activity log. The write itself is one
  // atomic update, and the response is what the database holds after it, so a change someone
  // else made a moment earlier is never left out (ADR 013).
  const before = await CardModel.findOne({ _id: cardId, boardId }, { archived: 1 }).lean();
  if (!before) throw new NotFound('Card not found');
  const card = await CardModel.findOneAndUpdate(
    { _id: cardId, boardId },
    { $set: set, $inc: { version: 1 } },
    { returnDocument: 'after', runValidators: true },
  ).lean();
  // Deleted between the two queries.
  if (!card) throw new NotFound('Card not found');

  const fields = Object.keys(input).filter((field) => field !== 'archived');
  if (fields.length > 0) {
    await logActivity({ boardId, actorId, cardId, type: 'card.updated', meta: { fields } });
  }
  if (card.archived !== before.archived) {
    const type = card.archived ? 'card.archived' : 'card.restored';
    await logActivity({ boardId, actorId, cardId, type });
  }
  // One event for any change, archiving included: the card carries `archived`.
  const dto = toCardDto(card);
  emitToBoard(boardId, 'card:updated', { boardId, actorId, card: dto });
  return dto;
}

export async function moveCard(
  boardId: string,
  cardId: string,
  actorId: string,
  input: MoveCardInput,
): Promise<CardDto> {
  const { listId, beforeId, afterId } = input;
  if (beforeId === cardId || afterId === cardId) {
    throw new ValidationError(undefined, 'A card cannot be its own neighbour');
  }

  const card = await CardModel.findOne({ _id: cardId, boardId }, { listId: 1, archived: 1 }).lean();
  if (!card) throw new NotFound('Card not found');
  if (card.archived) throw new ValidationError(undefined, 'Restore the card before moving it');
  // Missing or on another board: the client's view is stale, and other boards stay hidden.
  if (!(await ListModel.exists({ _id: listId, boardId }))) throw new Conflict(STALE_ORDER_MESSAGE);

  const [before, after] = await Promise.all([
    neighbourPosition(listId, beforeId),
    neighbourPosition(listId, afterId),
  ]);
  // A visible card between the neighbours (or in a list the client thought was empty) means the
  // client's order is out of date. Archived cards are invisible to the client, so they don't count.
  const inGap = await CardModel.exists({
    boardId,
    listId,
    archived: false,
    _id: { $ne: cardId },
    ...positionGap(before, after),
  });
  if (inGap) throw new Conflict(STALE_ORDER_MESSAGE);

  // The only write: this card's list and position. No other card is renumbered.
  const moved = await writeAtPosition(before, after, (position) =>
    CardModel.findOneAndUpdate(
      { _id: cardId, boardId },
      { $set: { listId, position }, $inc: { version: 1 } },
      { returnDocument: 'after' },
    ).lean(),
  );
  if (!moved) throw new NotFound('Card not found');

  await logActivity({
    boardId,
    actorId,
    cardId,
    type: 'card.moved',
    meta: { fromListId: card.listId.toString(), toListId: listId },
  });
  const dto = toCardDto(moved);
  emitToBoard(boardId, 'card:moved', {
    boardId,
    actorId,
    card: dto,
    fromListId: card.listId.toString(),
  });
  return dto;
}

export async function deleteCard(boardId: string, cardId: string, actorId: string): Promise<void> {
  const card = await CardModel.findOneAndDelete({ _id: cardId, boardId }).lean();
  if (!card) throw new NotFound('Card not found');

  await logActivity({
    boardId,
    actorId,
    cardId,
    type: 'card.deleted',
    meta: { listId: card.listId.toString(), title: card.title },
  });
  emitToBoard(boardId, 'card:deleted', {
    boardId,
    actorId,
    cardId,
    listId: card.listId.toString(),
  });
}

/** A neighbour must be a visible card in the target list; anything else means a stale view. */
async function neighbourPosition(
  listId: string,
  cardId: string | undefined,
): Promise<string | null> {
  if (cardId === undefined) return null;
  const card = await CardModel.findOne(
    { _id: cardId, listId, archived: false },
    { position: 1 },
  ).lean();
  if (!card) throw new Conflict(STALE_ORDER_MESSAGE);
  return card.position;
}

// Checklist items are written one at a time with a single atomic update each, so two people
// ticking different items at once can't overwrite each other's change (ADR 013). Every
// write returns the whole card, logs one activity entry and broadcasts card:updated.

export async function addChecklistItem(
  boardId: string,
  cardId: string,
  actorId: string,
  { text }: AddChecklistItemInput,
): Promise<CardDto> {
  // The size check is part of the filter, so two concurrent adds can't pass the limit.
  const card = await CardModel.findOneAndUpdate(
    { _id: cardId, boardId, [`checklist.${CHECKLIST_MAX_ITEMS - 1}`]: { $exists: false } },
    { $push: { checklist: { text, done: false } }, $inc: { version: 1 } },
    { returnDocument: 'after' },
  ).lean();
  if (!card) {
    if (await CardModel.exists({ _id: cardId, boardId })) {
      throw new ValidationError(
        undefined,
        `A checklist holds at most ${CHECKLIST_MAX_ITEMS} items`,
      );
    }
    throw new NotFound('Card not found');
  }
  return afterChecklistWrite(boardId, actorId, card);
}

export async function updateChecklistItem(
  boardId: string,
  cardId: string,
  itemId: string,
  actorId: string,
  { text, done }: UpdateChecklistItemInput,
): Promise<CardDto> {
  // `checklist.$` is the item the filter matched, so only that item's fields change.
  const set: Record<string, string | boolean> = {};
  if (text !== undefined) set['checklist.$.text'] = text;
  if (done !== undefined) set['checklist.$.done'] = done;

  const card = await CardModel.findOneAndUpdate(
    { _id: cardId, boardId, 'checklist._id': itemId },
    { $set: set, $inc: { version: 1 } },
    { returnDocument: 'after' },
  ).lean();
  if (!card) throw await checklistNotFound(boardId, cardId);
  return afterChecklistWrite(boardId, actorId, card);
}

export async function deleteChecklistItem(
  boardId: string,
  cardId: string,
  itemId: string,
  actorId: string,
): Promise<CardDto> {
  const card = await CardModel.findOneAndUpdate(
    { _id: cardId, boardId, 'checklist._id': itemId },
    { $pull: { checklist: { _id: itemId } }, $inc: { version: 1 } },
    { returnDocument: 'after' },
  ).lean();
  if (!card) throw await checklistNotFound(boardId, cardId);
  return afterChecklistWrite(boardId, actorId, card);
}

/** Tells a missing card apart from a missing item, for a clearer 404. */
async function checklistNotFound(boardId: string, cardId: string): Promise<NotFound> {
  const cardExists = await CardModel.exists({ _id: cardId, boardId });
  return new NotFound(cardExists ? 'Checklist item not found' : 'Card not found');
}

async function afterChecklistWrite(
  boardId: string,
  actorId: string,
  card: Parameters<typeof toCardDto>[0],
): Promise<CardDto> {
  const cardId = card._id.toString();
  await logActivity({
    boardId,
    actorId,
    cardId,
    type: 'card.updated',
    meta: { fields: ['checklist'] },
  });
  const dto = toCardDto(card);
  emitToBoard(boardId, 'card:updated', { boardId, actorId, card: dto });
  return dto;
}
