import type { Role } from '@taskboard/shared';
import { isObjectIdOrHexString } from 'mongoose';
import { CardModel } from '../cards/model.js';
import { ListModel } from '../lists/model.js';
import { BoardModel } from './model.js';

// Every lookup returns null for a malformed id instead of letting Mongoose throw a CastError,
// so a bad id gets the same 404 as an unknown one.

export async function findBoardIdForList(listId: string): Promise<string | null> {
  if (!isObjectIdOrHexString(listId)) return null;
  const list = await ListModel.findById(listId, { boardId: 1 }).lean();
  return list ? list.boardId.toString() : null;
}

export async function findBoardIdForCard(cardId: string): Promise<string | null> {
  if (!isObjectIdOrHexString(cardId)) return null;
  const card = await CardModel.findById(cardId, { boardId: 1 }).lean();
  return card ? card.boardId.toString() : null;
}

/** The user's role on the board, or null if the board does not exist or they are not a member. */
export async function findMemberRole(boardId: string, userId: string): Promise<Role | null> {
  if (!isObjectIdOrHexString(boardId)) return null;
  // `members.$` projects only the array element the query matched, not the whole member list.
  const board = await BoardModel.findOne(
    { _id: boardId, 'members.userId': userId },
    { 'members.$': 1 },
  ).lean();
  return board?.members[0]?.role ?? null;
}
