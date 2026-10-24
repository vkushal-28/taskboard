import { describe, expect, it } from 'vitest';
import { hasRole, Role, ROLES, type Role as RoleName } from './roles.js';

describe('hasRole', () => {
  const cases: [actual: RoleName, minRole: RoleName, expected: boolean][] = [
    ['owner', 'owner', true],
    ['owner', 'member', true],
    ['owner', 'viewer', true],
    ['member', 'owner', false],
    ['member', 'member', true],
    ['member', 'viewer', true],
    ['viewer', 'owner', false],
    ['viewer', 'member', false],
    ['viewer', 'viewer', true],
  ];

  it.each(cases)('%s meets min role %s: %s', (actual, minRole, expected) => {
    expect(hasRole(actual, minRole)).toBe(expected);
  });

  it('covers every role', () => {
    expect(ROLES).toEqual(['viewer', 'member', 'owner']);
    expect(Role.owner).toBe('owner');
  });
});
