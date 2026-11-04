import { z } from 'zod';
import { emailSchema } from './auth.js';
import { boardMemberDtoSchema } from './boards.js';
import { roleSchema } from './roles.js';

export const INVITE_TTL_DAYS = 7;

/** Owners are made with a role change after joining, never straight from an invite. */
export const inviteRoleSchema = roleSchema.exclude(['owner']);

export const createInviteSchema = z.object({
  email: emailSchema,
  role: inviteRoleSchema.default('member'),
});

export const inviteDtoSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: inviteRoleSchema,
  invitedBy: z.object({ id: z.string(), name: z.string() }).nullable(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});

export const inviteListResponseSchema = z.object({ invites: z.array(inviteDtoSchema) });

/**
 * Create and resend return the link once, so the owner can copy it when email can't reach the
 * invitee. Only the invited email can accept it (ADR 015). `emailed` says whether an email
 * went out too.
 */
export const inviteWithLinkResponseSchema = z.object({
  invite: inviteDtoSchema,
  link: z.url(),
  emailed: z.boolean(),
});

/** What the accept page shows before the user accepts. */
export const invitePreviewSchema = z.object({
  board: z.object({ id: z.string(), title: z.string(), color: z.string() }),
  role: inviteRoleSchema,
  email: z.string(),
  invitedBy: z.object({ name: z.string() }).nullable(),
});

export const acceptInviteResponseSchema = z.object({ boardId: z.string(), role: roleSchema });

export const updateMemberSchema = z.object({ role: roleSchema });

export const membersResponseSchema = z.object({ members: z.array(boardMemberDtoSchema) });

/** Error codes the accept page turns into messages. */
export const INVITE_ERROR_CODES = [
  'INVITE_NOT_FOUND',
  'INVITE_EXPIRED',
  'INVITE_REVOKED',
  'INVITE_USED',
  'INVITE_WRONG_ACCOUNT',
] as const;
export type InviteErrorCode = (typeof INVITE_ERROR_CODES)[number];

export type CreateInviteInput = z.infer<typeof createInviteSchema>;
export type InviteDto = z.infer<typeof inviteDtoSchema>;
export type InvitePreview = z.infer<typeof invitePreviewSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
