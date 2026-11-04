import type { BoardMemberDto, Role } from '@taskboard/shared';
import type { Types } from 'mongoose';
import { Conflict, NotFound } from '../../lib/errors.js';
import { logActivity } from '../activity/service.js';
import { BoardModel } from '../boards/model.js';
import { CardModel } from '../cards/model.js';
import { emitToBoard, syncMemberSockets } from '../realtime/emitter.js';

const LAST_OWNER_MESSAGE = 'A board needs at least one owner. Make someone else an owner first.';

interface PopulatedMember {
  userId: { _id: Types.ObjectId; name: string } | null;
  role: Role;
}

/** The board's members with names. A deleted user populates as null and is left out. */
export async function listMembers(boardId: string): Promise<BoardMemberDto[]> {
  const board = await BoardModel.findById(boardId, { members: 1 })
    .populate<{ members: PopulatedMember[] }>('members.userId', 'name')
    .lean();
  if (!board) throw new NotFound('Board not found');
  return board.members.flatMap(({ userId: user, role }) =>
    user ? [{ id: user._id.toString(), name: user.name, role }] : [],
  );
}

/**
 * Matches the board only while someone other than `userId` is an owner. Part of the update's
 * own filter, so two owners demoting or removing each other at the same moment can't both
 * succeed and leave the board without an owner (ADR 015).
 */
function anotherOwnerThan(userId: string) {
  return { members: { $elemMatch: { role: 'owner', userId: { $ne: userId } } } };
}

export async function changeRole(
  boardId: string,
  actorId: string,
  userId: string,
  role: Role,
): Promise<BoardMemberDto[]> {
  const result = await BoardModel.updateOne(
    {
      _id: boardId,
      'members.userId': userId,
      ...(role === 'owner' ? {} : anotherOwnerThan(userId)),
    },
    { $set: { 'members.$[target].role': role } },
    { arrayFilters: [{ 'target.userId': userId }] },
  );
  if (result.matchedCount === 0) await explainNoMatch(boardId, userId);
  if (result.modifiedCount === 0) return listMembers(boardId);

  await syncMemberSockets(boardId, userId, role);
  return announce(boardId, actorId, 'member.role_changed', { userId, role });
}

export async function removeMember(
  boardId: string,
  actorId: string,
  userId: string,
): Promise<BoardMemberDto[]> {
  const result = await BoardModel.updateOne(
    { _id: boardId, 'members.userId': userId, ...anotherOwnerThan(userId) },
    { $pull: { members: { userId } } },
  );
  if (result.matchedCount === 0) await explainNoMatch(boardId, userId);

  // After the membership is gone (ADR 006): assignees must be members, and a card that still
  // listed them would fail its next assignee update.
  await CardModel.updateMany(
    { boardId, assignees: userId },
    { $pull: { assignees: userId }, $inc: { version: 1 } },
  );
  const members = await announce(boardId, actorId, 'member.removed', { userId });
  // After the broadcast, so the removed user's own sockets hear that they were removed.
  await syncMemberSockets(boardId, userId, null);
  return members;
}

/** Adds a user who accepted an invite. Someone who is already a member keeps their role. */
export async function addMember(boardId: string, userId: string, role: Role): Promise<Role> {
  const added = await BoardModel.updateOne(
    { _id: boardId, 'members.userId': { $ne: userId } },
    { $push: { members: { userId, role } } },
  );
  if (added.modifiedCount === 1) return role;
  const board = await BoardModel.findOne(
    { _id: boardId, 'members.userId': userId },
    { 'members.$': 1 },
  ).lean();
  const existing = board?.members[0]?.role;
  if (!existing) throw new NotFound('Board not found');
  return existing;
}

/** Logs the change and sends every client on the board the new member list. */
export async function announce(
  boardId: string,
  actorId: string,
  type: 'member.joined' | 'member.role_changed' | 'member.removed',
  meta: Record<string, unknown>,
): Promise<BoardMemberDto[]> {
  const members = await listMembers(boardId);
  await logActivity({ boardId, actorId, type, meta });
  emitToBoard(boardId, 'members:updated', { boardId, actorId, members });
  return members;
}

async function explainNoMatch(boardId: string, userId: string): Promise<never> {
  const isMember = await BoardModel.exists({ _id: boardId, 'members.userId': userId });
  if (!isMember) throw new NotFound('Member not found');
  throw new Conflict(LAST_OWNER_MESSAGE, 'LAST_OWNER');
}
