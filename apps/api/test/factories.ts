import { randomUUID } from 'node:crypto';
import { publicUserSchema, type Role } from '@taskboard/shared';
import bcrypt from 'bcryptjs';
import type { Express } from 'express';
import request from 'supertest';
import { expect } from 'vitest';
import type { HydratedDocument, Types } from 'mongoose';
import { z } from 'zod';
import { ACCESS_COOKIE } from '../src/modules/auth/cookies.js';
import { positionBetween } from '../src/lib/position.js';
import { signAccessToken } from '../src/modules/auth/tokens.js';
import { BoardModel } from '../src/modules/boards/model.js';
import { CardModel } from '../src/modules/cards/model.js';
import { ListModel } from '../src/modules/lists/model.js';
import { UserModel, type User } from '../src/modules/users/model.js';

export const DEFAULT_PASSWORD = 'correct-horse-battery';

// bcrypt stores its cost inside the hash, so a cost-4 hash still verifies through the real
// login code while keeping each test user to ~1 ms instead of ~250 ms.
let cachedHash: string | undefined;
function defaultPasswordHash(): string {
  cachedHash ??= bcrypt.hashSync(DEFAULT_PASSWORD, 4);
  return cachedHash;
}

export async function createUser(overrides: Partial<Pick<User, 'name' | 'email'>> = {}) {
  return UserModel.create({
    name: overrides.name ?? 'Test User',
    email: overrides.email ?? `user-${randomUUID()}@example.com`,
    passwordHash: defaultPasswordHash(),
  });
}

/** Returns a Supertest agent that keeps the auth cookies set by a real login. */
export async function loginAs(app: Express, email: string, password = DEFAULT_PASSWORD) {
  const agent = request.agent(app);
  const res = await agent.post('/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return agent;
}

/** A `Cookie` header value that authenticates as `user`, for apps without the auth routes. */
export async function accessCookieFor(user: HydratedDocument<User>): Promise<string> {
  return `${ACCESS_COOKIE}=${await signAccessToken(user.id)}`;
}

export async function createBoard(
  owner: HydratedDocument<User>,
  others: { user: HydratedDocument<User>; role: Role }[] = [],
) {
  return BoardModel.create({
    title: 'Test Board',
    color: '#2563eb',
    members: [
      { userId: owner._id, role: 'owner' },
      ...others.map(({ user, role }) => ({ userId: user._id, role })),
    ],
  });
}

/** A board with one user per role, plus an outsider who is not a member. */
export async function createBoardWithRoles() {
  const [owner, member, viewer, outsider] = await Promise.all(
    ['Owner', 'Member', 'Viewer', 'Outsider'].map((name) => createUser({ name })),
  );
  if (!owner || !member || !viewer || !outsider) throw new Error('failed to create users');
  const board = await createBoard(owner, [
    { user: member, role: 'member' },
    { user: viewer, role: 'viewer' },
  ]);
  return { board, owner, member, viewer, outsider };
}

/** Positions default to after the last list, so tests never collide on the unique index. */
export async function createList(boardId: Types.ObjectId, position?: string) {
  const last = await ListModel.findOne({ boardId }).sort({ position: -1 }).lean();
  return ListModel.create({
    boardId,
    title: 'Test List',
    position: position ?? positionBetween(last?.position ?? null, null),
  });
}

/** Positions default to after the last card in the list, archived ones included. */
export async function createCard(
  list: { _id: Types.ObjectId; boardId: Types.ObjectId },
  overrides: { position?: string; archived?: boolean; title?: string } = {},
) {
  const last = await CardModel.findOne({ listId: list._id }).sort({ position: -1 }).lean();
  return CardModel.create({
    boardId: list.boardId,
    listId: list._id,
    title: overrides.title ?? 'Test Card',
    archived: overrides.archived ?? false,
    position: overrides.position ?? positionBetween(last?.position ?? null, null),
  });
}

export function getCookie(res: request.Response, name: string): string | undefined {
  const header = res.headers['set-cookie'] as string[] | string | undefined;
  const cookies = Array.isArray(header) ? header : header ? [header] : [];
  return cookies.find((cookie) => cookie.startsWith(`${name}=`));
}

export function cookieValue(cookie: string | undefined): string | undefined {
  return cookie?.split(';')[0]?.split('=')[1];
}

const errorBodySchema = z.object({
  error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }),
});
const userBodySchema = z.object({ user: publicUserSchema.strict() });

/** Parses a response body with `schema`, failing the test if the shape is wrong. */
export function parseBody<T extends z.ZodType>(schema: T, res: request.Response): z.infer<T> {
  return schema.parse(res.body);
}

/** Parses `{ error }` from a response body, failing the test if the shape is wrong. */
export function errorOf(res: request.Response) {
  return errorBodySchema.parse(res.body).error;
}

/** Parses `{ user }` from a response body; `.strict()` fails on any extra field (e.g. a hash). */
export function userOf(res: request.Response) {
  return userBodySchema.parse(res.body).user;
}
