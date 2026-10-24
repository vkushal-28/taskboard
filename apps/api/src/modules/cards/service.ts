import type { CardDto, CreateCardInput, MoveCardInput, UpdateCardInput } from '@taskboard/shared';
import { Types } from 'mongoose';
import { Conflict, NotFound, ValidationError } from '../../lib/errors.js';
import { positionGap, STALE_ORDER_MESSAGE, writeAtPosition } from '../../lib/position.js';
import { logActivity } from '../activity/service.js';
import { areBoardMembers } from '../boards/access.js';
import { ListModel } from '../lists/model.js';
import { CardModel, toCardDto } from './model.js';

export async function createCard(
  boardId: string,
  listId: string,
  actorId: string,
  input: CreateCardInput,
): Promise<CardDto> {
  // After the last card, archived ones included: they still hold their positions.
  const last = await CardModel.findOne({ listId }, { position: 1 }).sort({ position: -1 }).lean();
  const card = await writeAtPosition(last?.position ?? null, null, (position) =>
    CardModel.create({ boardId, listId, ...input, position }),
  );

  await logActivity({ boardId, actorId, cardId: card.id, type: 'card.created', meta: { listId } });
  return toCardDto(card);
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
  const card = await CardModel.findOne({ _id: cardId, boardId });
  if (!card) throw new NotFound('Card not found');

  card.set(plainFields);
  if (dueDate !== undefined) card.dueDate = dueDate === null ? null : new Date(dueDate);
  if (assignees !== undefined) {
    const uniqueIds = [...new Set(assignees)];
    if (!(await areBoardMembers(boardId, uniqueIds))) {
      throw new ValidationError(undefined, 'Assignees must be members of the board');
    }
    card.assignees = uniqueIds.map((userId) => new Types.ObjectId(userId));
  }
  if (checklist !== undefined) {
    // Items sent with an id keep it, so the client can keep tracking them across saves.
    card.set(
      'checklist',
      checklist.map(({ id, text, done }) => (id ? { _id: id, text, done } : { text, done })),
    );
  }

  const archiveChanged = card.isModified('archived');
  await card.save();

  const fields = Object.keys(input).filter((field) => field !== 'archived');
  if (fields.length > 0) {
    await logActivity({ boardId, actorId, cardId, type: 'card.updated', meta: { fields } });
  }
  if (archiveChanged) {
    const type = card.archived ? 'card.archived' : 'card.restored';
    await logActivity({ boardId, actorId, cardId, type });
  }
  return toCardDto(card);
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
      { listId, position },
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
  return toCardDto(moved);
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
