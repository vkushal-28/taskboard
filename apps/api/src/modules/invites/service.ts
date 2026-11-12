import {
  DAY_MS,
  INVITE_TTL_DAYS,
  type CreateInviteInput,
  type InviteDto,
  type InvitePreview,
  type Role,
} from '@taskboard/shared';
import { randomBytes } from 'node:crypto';
import type { Types } from 'mongoose';
import { env } from '../../config/env.js';
import { Conflict, Forbidden, Gone, NotFound } from '../../lib/errors.js';
import { sha256Hex } from '../../lib/hash.js';
import { sendEmail } from '../../lib/mailer.js';
import { logActivity } from '../activity/service.js';
import { BoardModel } from '../boards/model.js';
import { addMember, announce } from '../members/service.js';
import { UserModel } from '../users/model.js';
import { InviteModel, PENDING, toInviteDto, type Invite } from './model.js';

const TTL_MS = INVITE_TTL_DAYS * DAY_MS;

interface IssuedInvite {
  invite: InviteDto;
  link: string;
  emailed: boolean;
}

/** A fresh token for the link, and the hash that is stored instead of it. */
function issueToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: sha256Hex(token) };
}

function inviteLink(token: string): string {
  return new URL(`/invite/${token}`, env.CLIENT_URL).toString();
}

export async function listInvites(boardId: string): Promise<InviteDto[]> {
  const invites = await InviteModel.find({ boardId, ...PENDING })
    .sort({ _id: -1 })
    .lean();
  const inviters = await UserModel.find(
    { _id: { $in: [...new Set(invites.map((invite) => invite.invitedBy.toString()))] } },
    { name: 1 },
  ).lean();
  const names = new Map(inviters.map((user) => [user._id.toString(), user.name]));
  return invites.map((invite) => toInviteDto(invite, inviterOf(invite, names)));
}

export async function createInvite(
  boardId: string,
  actorId: string,
  { email, role }: CreateInviteInput,
): Promise<IssuedInvite> {
  const existingUser = await UserModel.findOne({ email }, { _id: 1 }).lean();
  if (
    existingUser &&
    (await BoardModel.exists({ _id: boardId, 'members.userId': existingUser._id }))
  ) {
    throw new Conflict(`${email} is already a member of this board`, 'ALREADY_MEMBER');
  }
  const now = new Date();
  if (await InviteModel.exists({ boardId, email, ...PENDING, expiresAt: { $gt: now } })) {
    throw new Conflict(`${email} already has a pending invite`, 'ALREADY_INVITED');
  }
  // An expired invite doesn't block a new one, but it would stay in the pending list next to
  // it, so it's retired here.
  await InviteModel.updateMany(
    { boardId, email, ...PENDING, expiresAt: { $lte: now } },
    { $set: { revokedAt: now } },
  );

  const { token, tokenHash } = issueToken();
  const invite = await InviteModel.create({
    boardId,
    email,
    role,
    tokenHash,
    invitedBy: actorId,
    expiresAt: new Date(Date.now() + TTL_MS),
  });
  await logActivity({
    boardId,
    actorId,
    type: 'member.invited',
    meta: { inviteId: invite.id, role },
  });
  return deliver(boardId, actorId, invite.toObject(), token);
}

/** A new token and a new expiry. The old link stops working. */
export async function resendInvite(
  boardId: string,
  actorId: string,
  inviteId: string,
): Promise<IssuedInvite> {
  const { token, tokenHash } = issueToken();
  const invite = await InviteModel.findOneAndUpdate(
    { _id: inviteId, boardId, ...PENDING },
    { $set: { tokenHash, expiresAt: new Date(Date.now() + TTL_MS) } },
    { returnDocument: 'after' },
  ).lean();
  if (!invite) throw new NotFound('Invite not found');
  return deliver(boardId, actorId, invite, token);
}

// Invite changes are logged but not broadcast: the board room includes viewers, and the
// pending list holds email addresses only owners should see.
export async function revokeInvite(
  boardId: string,
  actorId: string,
  inviteId: string,
): Promise<void> {
  const revoked = await InviteModel.updateOne(
    { _id: inviteId, boardId, ...PENDING },
    { $set: { revokedAt: new Date() } },
  );
  if (revoked.matchedCount === 0) throw new NotFound('Invite not found');
  await logActivity({ boardId, actorId, type: 'member.invite_revoked', meta: { inviteId } });
}

export async function previewInvite(token: string, userId: string): Promise<InvitePreview> {
  const invite = await InviteModel.findOne({ tokenHash: sha256Hex(token) }).lean();
  const email = await emailOf(userId);
  assertUsable(invite, email);
  const [board, inviter] = await Promise.all([
    BoardModel.findById(invite.boardId, { title: 1, color: 1 }).lean(),
    UserModel.findById(invite.invitedBy, { name: 1 }).lean(),
  ]);
  if (!board) throw invalidInvite();
  return {
    board: { id: board._id.toString(), title: board.title, color: board.color },
    role: invite.role,
    email: invite.email,
    invitedBy: inviter ? { name: inviter.name } : null,
  };
}

export async function acceptInvite(
  token: string,
  userId: string,
): Promise<{ boardId: string; role: Role }> {
  const tokenHash = sha256Hex(token);
  const email = await emailOf(userId);
  // One atomic claim: of two requests with the same token, only one gets the invite.
  const claimed = await InviteModel.findOneAndUpdate(
    { tokenHash, email, ...PENDING, expiresAt: { $gt: new Date() } },
    { $set: { acceptedAt: new Date(), acceptedBy: userId } },
    { returnDocument: 'after' },
  ).lean();
  if (!claimed) {
    // Explains why, from the invite as it is now. It always throws: the claim's filter and
    // assertUsable check the same conditions.
    assertUsable(await InviteModel.findOne({ tokenHash }).lean(), email);
    throw invalidInvite();
  }

  // After the claim (ADR 006): a crash in between leaves a used invite and no membership,
  // which the owner fixes with a new invite. The reverse order could let a token be used twice.
  const boardId = claimed.boardId.toString();
  const role = await addMember(boardId, userId, claimed.role);
  await announce(boardId, userId, 'member.joined', { inviteId: claimed._id.toString(), role });
  return { boardId, role };
}

// Checked in this order, so a revoked invite says "revoked" even after it has also expired.
function assertUsable(
  invite: (Invite & { _id: unknown }) | null,
  email: string,
): asserts invite is Invite & { _id: unknown } {
  if (!invite) throw invalidInvite();
  if (invite.revokedAt)
    throw new Gone('This invite was revoked by the board owner.', 'INVITE_REVOKED');
  if (invite.acceptedAt) throw new Gone('This invite has already been used.', 'INVITE_USED');
  if (invite.expiresAt <= new Date()) {
    throw new Gone('This invite has expired. Ask the board owner for a new one.', 'INVITE_EXPIRED');
  }
  if (invite.email !== email) {
    throw new Forbidden(
      `This invite was sent to ${invite.email}. Sign in with that email to accept it.`,
      'INVITE_WRONG_ACCOUNT',
    );
  }
}

function invalidInvite(): NotFound {
  return new NotFound('This invite link is not valid.', 'INVITE_NOT_FOUND');
}

async function emailOf(userId: string): Promise<string> {
  const user = await UserModel.findById(userId, { email: 1 }).lean();
  if (!user) throw invalidInvite();
  return user.email;
}

function inviterOf(invite: Invite, names: Map<string, string>) {
  const id = invite.invitedBy.toString();
  const name = names.get(id);
  return name === undefined ? null : { id, name };
}

/** Emails the link when Resend is set up, and returns it for the owner to copy (ADR 015). */
async function deliver(
  boardId: string,
  actorId: string,
  invite: Invite & { _id: Types.ObjectId },
  token: string,
): Promise<IssuedInvite> {
  const [board, inviter] = await Promise.all([
    BoardModel.findById(boardId, { title: 1 }).lean(),
    UserModel.findById(actorId, { name: 1 }).lean(),
  ]);
  const link = inviteLink(token);
  const who = inviter?.name ?? 'Someone';
  const emailed = await sendEmail({
    to: invite.email,
    subject: `${who} invited you to "${board?.title ?? 'a board'}" on Taskboard`,
    text: [
      `${who} invited you to join "${board?.title ?? 'a board'}" on Taskboard as a ${invite.role}.`,
      '',
      `Accept the invite: ${link}`,
      '',
      `The link works for ${INVITE_TTL_DAYS} days, and only for ${invite.email}.`,
    ].join('\n'),
  });
  return {
    invite: toInviteDto(invite, inviter ? { id: actorId, name: inviter.name } : null),
    link,
    emailed,
  };
}
