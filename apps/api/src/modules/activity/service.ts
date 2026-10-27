import type { ActivityItem, ActivityType } from '@taskboard/shared';
import { isValidObjectId } from 'mongoose';
import { logger } from '../../lib/logger.js';
import { BoardModel } from '../boards/model.js';
import { CardModel } from '../cards/model.js';
import { ListModel } from '../lists/model.js';
import { UserModel } from '../users/model.js';
import { ActivityModel, type Activity } from './model.js';

export interface ActivityEntry {
  boardId: string;
  actorId: string;
  type: ActivityType;
  cardId?: string;
  meta?: Record<string, unknown>;
}

/**
 * Records a write that already succeeded. Never throws: failing the request here would make
 * the client retry a write that is already saved, so a lost activity row is the lesser harm.
 */
export async function logActivity(entry: ActivityEntry): Promise<void> {
  try {
    await ActivityModel.create({ ...entry, cardId: entry.cardId ?? null, meta: entry.meta ?? {} });
  } catch (err) {
    logger.error({ err, boardId: entry.boardId, type: entry.type }, 'failed to log activity');
  }
}

/** The newest activity across every board the user is a member of, with names resolved. */
export async function listRecentActivity(userId: string, limit: number): Promise<ActivityItem[]> {
  const boards = await BoardModel.find({ 'members.userId': userId }, { title: 1, color: 1 }).lean();
  if (boards.length === 0) return [];

  // createdAt alone, with no _id tie-break, so Mongo can merge the per-board ranges of the
  // { boardId, createdAt } index instead of sorting every matching row in memory.
  const rows = await ActivityModel.find({ boardId: { $in: boards.map((board) => board._id) } })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  // One query per collection for the whole page, not one per row.
  const [users, cards, lists] = await Promise.all([
    UserModel.find(
      { _id: { $in: unique(rows.map((row) => row.actorId.toString())) } },
      { name: 1 },
    ).lean(),
    CardModel.find({ _id: { $in: unique(rows.map(cardIdOf)) } }, { title: 1 }).lean(),
    ListModel.find({ _id: { $in: unique(rows.map(listIdOf)) } }, { title: 1 }).lean(),
  ]);
  const boardsById = new Map(boards.map((board) => [board._id.toString(), board]));
  const userNames = new Map(users.map((user) => [user._id.toString(), user.name]));
  const cardTitles = new Map(cards.map((card) => [card._id.toString(), card.title]));
  const listTitles = new Map(lists.map((list) => [list._id.toString(), list.title]));

  return rows.flatMap((row) => {
    const board = boardsById.get(row.boardId.toString());
    if (!board) return [];
    const actorId = row.actorId.toString();
    const actorName = userNames.get(actorId);
    const cardId = cardIdOf(row);
    const listId = listIdOf(row);
    return [
      {
        id: row._id.toString(),
        type: row.type,
        createdAt: row.createdAt.toISOString(),
        actor: actorName === undefined ? null : { id: actorId, name: actorName },
        board: { id: board._id.toString(), title: board.title, color: board.color },
        card: named(cardId, cardTitles.get(cardId ?? '') ?? savedTitle(row, 'card.')),
        list: named(listId, listTitles.get(listId ?? '') ?? savedTitle(row, 'list.')),
      },
    ];
  });
}

function cardIdOf(row: Activity): string | undefined {
  return row.cardId?.toString();
}

// Moves record where the card went; other card and list events record the list they touched.
function listIdOf(row: Activity): string | undefined {
  const id = metaString(row, 'toListId') ?? metaString(row, 'listId');
  return id && isValidObjectId(id) ? id : undefined;
}

// Delete events keep the title in meta, because the document itself is gone.
function savedTitle(row: Activity, typePrefix: 'card.' | 'list.'): string | undefined {
  return row.type.startsWith(typePrefix) ? metaString(row, 'title') : undefined;
}

function metaString(row: Activity, key: string): string | undefined {
  const value = row.meta[key];
  return typeof value === 'string' ? value : undefined;
}

function named(id: string | undefined, title: string | undefined) {
  return id && title !== undefined ? { id, title } : null;
}

function unique(ids: (string | undefined)[]): string[] {
  return [...new Set(ids.filter((id) => id !== undefined))];
}
