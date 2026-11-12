import type { InviteDto } from '@taskboard/shared';
import { model, Schema, type Types } from 'mongoose';

export interface Invite {
  boardId: Types.ObjectId;
  /** Lowercased. Only the user with this email can accept (ADR 015). */
  email: string;
  role: 'member' | 'viewer';
  /** SHA-256 of the token in the link. The token itself is never stored. */
  tokenHash: string;
  invitedBy: Types.ObjectId;
  expiresAt: Date;
  acceptedAt: Date | null;
  acceptedBy: Types.ObjectId | null;
  revokedAt: Date | null;
  createdAt: Date;
}

const inviteSchema = new Schema<Invite>(
  {
    boardId: { type: Schema.Types.ObjectId, ref: 'Board', required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    role: { type: String, enum: ['member', 'viewer'], required: true },
    tokenHash: { type: String, required: true },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true },
    acceptedAt: { type: Date, default: null },
    acceptedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Accepting looks a token up across every board.
inviteSchema.index({ tokenHash: 1 }, { unique: true });
// The Share dialog lists a board's invites; creating one checks for a pending invite.
inviteSchema.index({ boardId: 1, email: 1 });

export const InviteModel = model<Invite>('Invite', inviteSchema);

/** Not accepted and not revoked. Expired invites still count: the owner can resend them. */
export const PENDING = { acceptedAt: null, revokedAt: null } as const;

/** The JSON shape of a pending invite shown in the Share dialog. */
export function toInviteDto(
  invite: Invite & { _id: Types.ObjectId },
  inviter: { id: string; name: string } | null,
): InviteDto {
  return {
    id: invite._id.toString(),
    email: invite.email,
    role: invite.role,
    invitedBy: inviter,
    createdAt: invite.createdAt.toISOString(),
    expiresAt: invite.expiresAt.toISOString(),
  };
}
