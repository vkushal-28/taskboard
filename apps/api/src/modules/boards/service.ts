import type {
  BoardDetail,
  BoardSummary,
  CreateBoardInput,
  Role,
  UpdateBoardInput,
} from '@taskboard/shared';
import type { Types } from 'mongoose';
import { NotFound } from '../../lib/errors.js';
import { positionBetween } from '../../lib/position.js';
import { ActivityModel } from '../activity/model.js';
import { logActivity } from '../activity/service.js';
import { CardModel, toCardDto } from '../cards/model.js';
import { ListModel, toListDto } from '../lists/model.js';
import { BoardModel, type BoardMember } from './model.js';

const STARTER_LISTS = ['To Do', 'In Progress', 'Done'];

// Lists and cards with equal positions (two inserts into the same gap at once) still come out
// in a stable order.
export const BY_POSITION = { position: 1, _id: 1 } as const;

interface BoardSummaryRow {
  _id: Types.ObjectId;
  title: string;
  color: string;
  updatedAt: Date;
  members: BoardMember[];
}

export async function listBoardsForUser(userId: string): Promise<BoardSummary[]> {
  // `members.$` returns only this user's member entry, which holds their role.
  const boards = await BoardModel.find(
    { 'members.userId': userId },
    { title: 1, color: 1, updatedAt: 1, 'members.$': 1 },
  )
    .sort({ updatedAt: -1 })
    .lean<BoardSummaryRow[]>();

  return boards.flatMap((board) => {
    const role = board.members[0]?.role;
    return role ? [toBoardSummary(board, role)] : [];
  });
}

export async function createBoard(userId: string, input: CreateBoardInput): Promise<BoardDetail> {
  const board = await BoardModel.create({
    title: input.title,
    color: input.color,
    members: [{ userId, role: 'owner' }],
  });

  try {
    let position: string | null = null;
    const lists = STARTER_LISTS.map((title) => {
      position = positionBetween(position, null);
      return { boardId: board._id, title, position };
    });
    await ListModel.insertMany(lists);
  } catch (err) {
    // No transaction (ADR 006): undo the board so a failed create leaves nothing behind.
    await BoardModel.deleteOne({ _id: board._id });
    throw err;
  }

  await logActivity({ boardId: board.id, actorId: userId, type: 'board.created' });
  return getBoardDetail(board.id, 'owner');
}

interface PopulatedMember {
  userId: { _id: Types.ObjectId; name: string } | null;
  role: Role;
}

export async function getBoardDetail(boardId: string, myRole: Role): Promise<BoardDetail> {
  const [board, lists, cards] = await Promise.all([
    BoardModel.findById(boardId)
      .populate<{ members: PopulatedMember[] }>('members.userId', 'name')
      .lean(),
    ListModel.find({ boardId }).sort(BY_POSITION).lean(),
    CardModel.find({ boardId, archived: false }).sort(BY_POSITION).lean(),
  ]);
  if (!board) throw new NotFound('Board not found');
  // A card created or moved while its list was being deleted can outlive the list (ADR 006).
  const listIds = new Set(lists.map((list) => list._id.toString()));
  const visibleCards = cards.filter((card) => listIds.has(card.listId.toString()));

  return {
    board: {
      id: board._id.toString(),
      title: board.title,
      color: board.color,
      myRole,
      // A deleted user populates as null; leave them out rather than show a blank member.
      members: board.members.flatMap(({ userId: user, role }) =>
        user ? [{ id: user._id.toString(), name: user.name, role }] : [],
      ),
    },
    lists: lists.map(toListDto),
    cards: visibleCards.map(toCardDto),
  };
}

export async function updateBoard(
  boardId: string,
  actorId: string,
  myRole: Role,
  input: UpdateBoardInput,
): Promise<BoardSummary> {
  const board = await BoardModel.findByIdAndUpdate(boardId, input, {
    returnDocument: 'after',
  }).lean();
  if (!board) throw new NotFound('Board not found');

  await logActivity({
    boardId,
    actorId,
    type: 'board.updated',
    meta: { fields: Object.keys(input) },
  });
  return toBoardSummary(board, myRole);
}

export async function deleteBoard(boardId: string): Promise<void> {
  // Board first (ADR 006): once it is gone the access check fails, so any children a crash
  // leaves behind cannot be reached.
  await BoardModel.deleteOne({ _id: boardId });
  await Promise.all([
    ListModel.deleteMany({ boardId }),
    CardModel.deleteMany({ boardId }),
    ActivityModel.deleteMany({ boardId }),
  ]);
}

function toBoardSummary(
  board: Pick<BoardSummaryRow, '_id' | 'title' | 'color' | 'updatedAt'>,
  role: Role,
): BoardSummary {
  return {
    id: board._id.toString(),
    title: board.title,
    color: board.color,
    role,
    updatedAt: board.updatedAt.toISOString(),
  };
}
