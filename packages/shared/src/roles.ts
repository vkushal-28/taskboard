import { z } from 'zod';

export const roleSchema = z.enum(['viewer', 'member', 'owner']);

export type Role = z.infer<typeof roleSchema>;
/** Role values by name, e.g. `Role.owner`. */
export const Role = roleSchema.enum;
export const ROLES = roleSchema.options;

const ROLE_RANK: Record<Role, number> = { viewer: 0, member: 1, owner: 2 };

/** True when `actual` is at least as powerful as `minRole`. */
export function hasRole(actual: Role, minRole: Role): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[minRole];
}
