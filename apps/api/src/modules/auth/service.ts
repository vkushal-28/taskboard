import { randomUUID } from 'node:crypto';
import type { LoginInput, PublicUser, RegisterInput } from '@taskboard/shared';
import bcrypt from 'bcryptjs';
import { mongo } from 'mongoose';
import { Conflict, Unauthorized } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { toPublicUser, UserModel } from '../users/model.js';
import { RefreshTokenModel } from './model.js';
import {
  generateRefreshToken,
  hashRefreshToken,
  REFRESH_TOKEN_TTL_MS,
  signAccessToken,
} from './tokens.js';

const BCRYPT_COST = 12;
// Two tabs can refresh with the same cookie at once. Within this window a reused token is
// treated as that race, not as theft, so the session survives.
export const REFRESH_REUSE_GRACE_MS = 10_000;

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult {
  user: PublicUser;
  tokens: SessionTokens;
}

// Comparing against a real hash when the email is unknown keeps login timing the same
// whether or not the account exists.
let dummyHash: Promise<string> | undefined;
function getDummyHash(): Promise<string> {
  dummyHash ??= bcrypt.hash('taskboard-timing-equalizer', BCRYPT_COST);
  return dummyHash;
}

export async function register(input: RegisterInput): Promise<AuthResult> {
  if (await UserModel.exists({ email: input.email })) {
    throw new Conflict('An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
  try {
    const user = await UserModel.create({ name: input.name, email: input.email, passwordHash });
    return { user: toPublicUser(user), tokens: await issueSession(user.id) };
  } catch (err) {
    // Two concurrent registrations can both pass the exists() check; the unique index decides.
    if (err instanceof mongo.MongoServerError && err.code === 11000) {
      throw new Conflict('An account with this email already exists');
    }
    throw err;
  }
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const user = await UserModel.findOne({ email: input.email }).select('+passwordHash');
  const passwordMatches = await bcrypt.compare(
    input.password,
    user?.passwordHash ?? (await getDummyHash()),
  );
  if (!user || !passwordMatches) throw new Unauthorized('Invalid email or password');

  return { user: toPublicUser(user), tokens: await issueSession(user.id) };
}

export async function refresh(refreshToken: string | undefined): Promise<SessionTokens> {
  if (!refreshToken) throw new Unauthorized('Refresh token missing');

  const tokenHash = hashRefreshToken(refreshToken);
  const now = new Date();

  // Atomic claim: only one request can flip revokedAt from null, so a token rotates exactly once.
  const claimed = await RefreshTokenModel.findOneAndUpdate(
    { tokenHash, revokedAt: null, expiresAt: { $gt: now } },
    { revokedAt: now },
  );
  if (claimed) return issueSession(claimed.userId.toString(), claimed.familyId);

  const existing = await RefreshTokenModel.findOne({ tokenHash });
  if (!existing || existing.expiresAt <= now || !existing.revokedAt) {
    throw new Unauthorized('Invalid refresh token');
  }

  if (now.getTime() - existing.revokedAt.getTime() <= REFRESH_REUSE_GRACE_MS) {
    // A distinct code tells the client its cookie was already replaced by another tab, so it
    // should retry the original request instead of logging the user out.
    throw new Unauthorized('Refresh token already rotated', 'REFRESH_TOKEN_ROTATED');
  }

  await revokeFamily(existing.familyId, now);
  logger.warn(
    { userId: existing.userId.toString(), familyId: existing.familyId },
    'refresh token reuse detected, session family revoked',
  );
  throw new Unauthorized('Invalid refresh token');
}

export async function logout(refreshToken: string | undefined): Promise<void> {
  if (!refreshToken) return;
  const existing = await RefreshTokenModel.findOne({ tokenHash: hashRefreshToken(refreshToken) });
  if (existing) await revokeFamily(existing.familyId, new Date());
}

export async function getCurrentUser(userId: string): Promise<PublicUser> {
  const user = await UserModel.findById(userId);
  if (!user) throw new Unauthorized('User no longer exists');
  return toPublicUser(user);
}

async function issueSession(
  userId: string,
  familyId: string = randomUUID(),
): Promise<SessionTokens> {
  const refreshToken = generateRefreshToken();
  await RefreshTokenModel.create({
    userId,
    familyId,
    tokenHash: hashRefreshToken(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  });
  return { accessToken: await signAccessToken(userId), refreshToken };
}

async function revokeFamily(familyId: string, at: Date): Promise<void> {
  await RefreshTokenModel.updateMany({ familyId, revokedAt: null }, { revokedAt: at });
}
