import { SignJWT } from 'jose';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  cookieValue,
  createUser,
  DEFAULT_PASSWORD,
  errorOf,
  getCookie,
  loginAs,
  userOf,
} from '../../../test/factories.js';
import { createApp } from '../../app.js';
import { UserModel } from '../users/model.js';
import { ACCESS_COOKIE, REFRESH_COOKIE } from './cookies.js';
import { RefreshTokenModel } from './model.js';
import { REFRESH_REUSE_GRACE_MS } from './service.js';
import { hashRefreshToken } from './tokens.js';

const CLIENT_ORIGIN = 'http://localhost:5173';

let app: ReturnType<typeof createApp>;
beforeEach(() => {
  app = createApp();
});

async function refreshWith(refreshToken: string) {
  return request(app).post('/auth/refresh').set('Cookie', `${REFRESH_COOKIE}=${refreshToken}`);
}

async function loginAndGetRefreshToken(email: string): Promise<string> {
  const res = await request(app).post('/auth/login').send({ email, password: DEFAULT_PASSWORD });
  const token = cookieValue(getCookie(res, REFRESH_COOKIE));
  if (!token) throw new Error('login did not set a refresh cookie');
  return token;
}

async function rotate(refreshToken: string): Promise<string> {
  const res = await refreshWith(refreshToken);
  expect(res.status).toBe(204);
  const next = cookieValue(getCookie(res, REFRESH_COOKIE));
  if (!next) throw new Error('refresh did not set a new refresh cookie');
  return next;
}

async function ageRevocation(refreshToken: string, ms: number) {
  await RefreshTokenModel.updateOne(
    { tokenHash: hashRefreshToken(refreshToken) },
    { revokedAt: new Date(Date.now() - ms) },
  );
}

describe('POST /auth/register', () => {
  const body = { name: 'Priya', email: 'Priya@Acme.dev', password: DEFAULT_PASSWORD };

  it('creates the user, logs them in and never returns the password', async () => {
    const res = await request(app).post('/auth/register').send(body);

    expect(res.status).toBe(201);
    expect(userOf(res)).toMatchObject({ name: 'Priya', email: 'priya@acme.dev' });
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
    expect(getCookie(res, ACCESS_COOKIE)).toBeDefined();
    expect(getCookie(res, REFRESH_COOKIE)).toBeDefined();
  });

  it('stores a bcrypt hash, not the password', async () => {
    await request(app).post('/auth/register').send(body);

    const user = await UserModel.findOne({ email: 'priya@acme.dev' }).select('+passwordHash');
    expect(user?.passwordHash).toMatch(/^\$2[aby]\$12\$/);
  });

  it('rejects a duplicate email regardless of case with 409', async () => {
    await createUser({ email: 'priya@acme.dev' });

    const res = await request(app).post('/auth/register').send(body);

    expect(res.status).toBe(409);
    expect(errorOf(res).code).toBe('CONFLICT');
  });

  it('rejects an invalid body with 400 and field errors', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'not-an-email', password: 'short' });

    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe('VALIDATION_ERROR');
    const details = z.object({ fieldErrors: z.record(z.string(), z.unknown()) });
    expect(Object.keys(details.parse(errorOf(res).details).fieldErrors)).toEqual(
      expect.arrayContaining(['name', 'email', 'password']),
    );
  });

  it('rejects a password longer than 72 bytes', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ ...body, password: 'a'.repeat(73) });

    expect(res.status).toBe(400);
  });
});

describe('POST /auth/login', () => {
  it('logs in with the right password and sets both cookies', async () => {
    const user = await createUser();

    const res = await request(app)
      .post('/auth/login')
      .send({ email: user.email, password: DEFAULT_PASSWORD });

    expect(res.status).toBe(200);
    expect(userOf(res)).toEqual({ id: user.id, name: user.name, email: user.email });
    expect(getCookie(res, ACCESS_COOKIE)).toBeDefined();
    expect(getCookie(res, REFRESH_COOKIE)).toBeDefined();
  });

  it('rejects a wrong password with 401', async () => {
    const user = await createUser();

    const res = await request(app)
      .post('/auth/login')
      .send({ email: user.email, password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(getCookie(res, ACCESS_COOKIE)).toBeUndefined();
  });

  it('gives an unknown email the same response as a wrong password', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'nobody@example.com', password: 'whatever' });

    expect(res.status).toBe(401);
    expect(errorOf(res).message).toBe('Invalid email or password');
  });

  it('sets httpOnly, SameSite=Lax cookies and scopes the refresh cookie to /auth', async () => {
    const user = await createUser();

    const res = await request(app)
      .post('/auth/login')
      .send({ email: user.email, password: DEFAULT_PASSWORD });

    const access = getCookie(res, ACCESS_COOKIE);
    const refresh = getCookie(res, REFRESH_COOKIE);
    expect(access).toMatch(/HttpOnly/);
    expect(access).toMatch(/SameSite=Lax/);
    expect(access).toMatch(/Path=\/;/);
    expect(refresh).toMatch(/HttpOnly/);
    expect(refresh).toMatch(/Path=\/auth/);
  });

  it('rate limits after 10 attempts in the window', async () => {
    const attempt = () =>
      request(app).post('/auth/login').send({ email: 'nobody@example.com', password: 'x' });

    for (let i = 0; i < 10; i++) expect((await attempt()).status).toBe(401);
    const res = await attempt();

    expect(res.status).toBe(429);
    expect(errorOf(res).code).toBe('TOO_MANY_REQUESTS');
  });
});

describe('POST /auth/refresh', () => {
  it('rotates the refresh token and revokes the old one', async () => {
    const user = await createUser();
    const original = await loginAndGetRefreshToken(user.email);

    const res = await refreshWith(original);

    expect(res.status).toBe(204);
    const next = cookieValue(getCookie(res, REFRESH_COOKIE));
    expect(next).toBeDefined();
    expect(next).not.toBe(original);
    expect(getCookie(res, ACCESS_COOKIE)).toBeDefined();
    const stored = await RefreshTokenModel.findOne({ tokenHash: hashRefreshToken(original) });
    expect(stored?.revokedAt).toBeInstanceOf(Date);
  });

  it('rejects a reused token inside the grace window but keeps the session', async () => {
    const user = await createUser();
    const original = await loginAndGetRefreshToken(user.email);
    const next = await rotate(original);

    const reuse = await refreshWith(original);

    expect(reuse.status).toBe(401);
    expect((await refreshWith(next)).status).toBe(204);
  });

  it('revokes the whole session family when a token is reused after the grace window', async () => {
    const user = await createUser();
    const original = await loginAndGetRefreshToken(user.email);
    const next = await rotate(original);
    await ageRevocation(original, REFRESH_REUSE_GRACE_MS + 1000);

    const reuse = await refreshWith(original);

    expect(reuse.status).toBe(401);
    expect((await refreshWith(next)).status).toBe(401);
    expect(await RefreshTokenModel.countDocuments({ userId: user._id, revokedAt: null })).toBe(0);
  });

  it('does not revoke other sessions of the same user on reuse', async () => {
    const user = await createUser();
    const laptop = await loginAndGetRefreshToken(user.email);
    const phone = await loginAndGetRefreshToken(user.email);
    await rotate(laptop);
    await ageRevocation(laptop, REFRESH_REUSE_GRACE_MS + 1000);

    await refreshWith(laptop);

    expect((await refreshWith(phone)).status).toBe(204);
  });

  it('rejects an expired refresh token', async () => {
    const user = await createUser();
    const token = await loginAndGetRefreshToken(user.email);
    await RefreshTokenModel.updateOne(
      { tokenHash: hashRefreshToken(token) },
      { expiresAt: new Date(Date.now() - 1000) },
    );

    expect((await refreshWith(token)).status).toBe(401);
  });

  it('rejects an unknown token and a missing cookie with 401', async () => {
    expect((await refreshWith('not-a-real-token')).status).toBe(401);
    expect((await request(app).post('/auth/refresh')).status).toBe(401);
  });
});

describe('POST /auth/logout', () => {
  it('clears the cookies and revokes the refresh token', async () => {
    const user = await createUser();
    const token = await loginAndGetRefreshToken(user.email);

    const res = await request(app).post('/auth/logout').set('Cookie', `${REFRESH_COOKIE}=${token}`);

    expect(res.status).toBe(204);
    expect(getCookie(res, ACCESS_COOKIE)).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(getCookie(res, REFRESH_COOKIE)).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect((await refreshWith(token)).status).toBe(401);
  });

  it('succeeds without a cookie', async () => {
    expect((await request(app).post('/auth/logout')).status).toBe(204);
  });
});

describe('GET /auth/me', () => {
  it('returns the current user with a valid access cookie', async () => {
    const user = await createUser();
    const agent = await loginAs(app, user.email);

    const res = await agent.get('/auth/me');

    expect(res.status).toBe(200);
    expect(userOf(res)).toEqual({ id: user.id, name: user.name, email: user.email });
  });

  it('returns 401 without a cookie', async () => {
    const res = await request(app).get('/auth/me');

    expect(res.status).toBe(401);
    expect(errorOf(res).code).toBe('UNAUTHORIZED');
  });

  it('returns 401 for a malformed token', async () => {
    const res = await request(app).get('/auth/me').set('Cookie', `${ACCESS_COOKIE}=garbage`);

    expect(res.status).toBe(401);
  });

  it('returns 401 for a token signed with another secret', async () => {
    const user = await createUser();
    const forged = await new SignJWT()
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setExpirationTime('15m')
      .sign(new TextEncoder().encode('an-attacker-secret-that-is-32-chars-long'));

    const res = await request(app).get('/auth/me').set('Cookie', `${ACCESS_COOKIE}=${forged}`);

    expect(res.status).toBe(401);
  });

  it('returns 401 for an expired token', async () => {
    const user = await createUser();
    const expired = await new SignJWT()
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(process.env.JWT_ACCESS_SECRET));

    const res = await request(app).get('/auth/me').set('Cookie', `${ACCESS_COOKIE}=${expired}`);

    expect(res.status).toBe(401);
    expect(errorOf(res).message).toBe('Access token expired');
  });
});

describe('CSRF origin check', () => {
  it('rejects a write from a foreign origin', async () => {
    const res = await request(app)
      .post('/auth/login')
      .set('Origin', 'https://evil.example')
      .send({ email: 'a@b.co', password: 'x' });

    expect(res.status).toBe(403);
    expect(errorOf(res).code).toBe('FORBIDDEN');
  });

  it('allows a write from the web app origin with credentialed CORS headers', async () => {
    const user = await createUser();

    const res = await request(app)
      .post('/auth/login')
      .set('Origin', CLIENT_ORIGIN)
      .send({ email: user.email, password: DEFAULT_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(CLIENT_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });
});
