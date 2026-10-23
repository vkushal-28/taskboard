import { randomUUID } from 'node:crypto';
import { publicUserSchema } from '@taskboard/shared';
import bcrypt from 'bcryptjs';
import type { Express } from 'express';
import request from 'supertest';
import { expect } from 'vitest';
import { z } from 'zod';
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

/** Parses `{ error }` from a response body, failing the test if the shape is wrong. */
export function errorOf(res: request.Response) {
  return errorBodySchema.parse(res.body).error;
}

/** Parses `{ user }` from a response body; `.strict()` fails on any extra field (e.g. a hash). */
export function userOf(res: request.Response) {
  return userBodySchema.parse(res.body).user;
}
