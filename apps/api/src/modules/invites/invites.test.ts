import {
  acceptInviteResponseSchema,
  boardDetailSchema,
  inviteListResponseSchema,
  invitePreviewSchema,
  inviteWithLinkResponseSchema,
} from '@taskboard/shared';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  accessCookieFor,
  createBoard,
  createUser,
  errorOf,
  parseBody,
} from '../../../test/factories.js';
import { createApp } from '../../app.js';
import { InviteModel } from './model.js';

let app: ReturnType<typeof createApp>;
beforeEach(() => {
  app = createApp();
});

async function setup() {
  const owner = await createUser({ name: 'Priya' });
  const invitee = await createUser({ name: 'Sam', email: 'sam@example.com' });
  const board = await createBoard(owner);
  return {
    owner,
    invitee,
    board,
    ownerCookie: await accessCookieFor(owner),
    inviteeCookie: await accessCookieFor(invitee),
  };
}

type Setup = Awaited<ReturnType<typeof setup>>;

async function invite(s: Setup, body: object = { email: 'sam@example.com', role: 'viewer' }) {
  const res = await request(app)
    .post(`/boards/${s.board.id}/invites`)
    .set('Cookie', s.ownerCookie)
    .send(body);
  expect(res.status).toBe(201);
  const issued = parseBody(inviteWithLinkResponseSchema, res);
  const token = issued.link.split('/invite/')[1] ?? '';
  return { ...issued, token };
}

const accept = (cookie: string, token: string) =>
  request(app).post(`/invites/${token}/accept`).set('Cookie', cookie);

const preview = (cookie: string, token: string) =>
  request(app).get(`/invites/${token}`).set('Cookie', cookie);

function expectError(res: request.Response, status: number, code: string) {
  expect(res.status).toBe(status);
  expect(errorOf(res).code).toBe(code);
}

describe('POST /boards/:boardId/invites', () => {
  it('stores only a hash of the token and returns the link once', async () => {
    const s = await setup();

    const {
      invite: dto,
      link,
      token,
      emailed,
    } = await invite(s, {
      email: '  Sam@Example.com ',
      role: 'viewer',
    });

    expect(link).toBe(`http://localhost:5173/invite/${token}`);
    // Tests run without RESEND_API_KEY, so no email goes out.
    expect(emailed).toBe(false);
    expect(dto).toMatchObject({
      email: 'sam@example.com',
      role: 'viewer',
      invitedBy: { name: 'Priya' },
    });
    const stored = await InviteModel.findById(dto.id).lean();
    expect(stored?.tokenHash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(JSON.stringify(stored)).not.toContain(token);
    const days = (Date.parse(dto.expiresAt) - Date.parse(dto.createdAt)) / 86_400_000;
    expect(Math.round(days)).toBe(7);
  });

  it('defaults to the member role and refuses owner', async () => {
    const s = await setup();
    expect((await invite(s, { email: 'sam@example.com' })).invite.role).toBe('member');

    const res = await request(app)
      .post(`/boards/${s.board.id}/invites`)
      .set('Cookie', s.ownerCookie)
      .send({ email: 'new@example.com', role: 'owner' });
    expectError(res, 400, 'VALIDATION_ERROR');
  });

  it('refuses someone who is already a member', async () => {
    const s = await setup();
    const res = await request(app)
      .post(`/boards/${s.board.id}/invites`)
      .set('Cookie', s.ownerCookie)
      .send({ email: s.owner.email });
    expectError(res, 409, 'ALREADY_MEMBER');
  });

  it('refuses a second pending invite, but not once the first has expired', async () => {
    const s = await setup();
    const first = await invite(s);
    const again = () =>
      request(app)
        .post(`/boards/${s.board.id}/invites`)
        .set('Cookie', s.ownerCookie)
        .send({ email: 'sam@example.com' });

    expectError(await again(), 409, 'ALREADY_INVITED');
    await InviteModel.updateOne(
      { _id: first.invite.id },
      { expiresAt: new Date(Date.now() - 1000) },
    );
    expect((await again()).status).toBe(201);
  });
});

describe('GET /boards/:boardId/invites', () => {
  it('lists pending invites, expired ones included, not accepted or revoked ones', async () => {
    const s = await setup();
    const accepted = await invite(s);
    await accept(s.inviteeCookie, accepted.token).expect(200);
    const revoked = await invite(s, { email: 'gone@example.com' });
    await request(app)
      .delete(`/boards/${s.board.id}/invites/${revoked.invite.id}`)
      .set('Cookie', s.ownerCookie)
      .expect(204);
    const expired = await invite(s, { email: 'late@example.com' });
    await InviteModel.updateOne(
      { _id: expired.invite.id },
      { expiresAt: new Date(Date.now() - 1000) },
    );
    await invite(s, { email: 'open@example.com' });

    const res = await request(app)
      .get(`/boards/${s.board.id}/invites`)
      .set('Cookie', s.ownerCookie);

    const emails = parseBody(inviteListResponseSchema, res).invites.map((item) => item.email);
    expect(emails).toEqual(['open@example.com', 'late@example.com']);
  });
});

describe('accepting an invite', () => {
  it('previews the board, role and inviter', async () => {
    const s = await setup();
    const { token } = await invite(s);

    const res = await preview(s.inviteeCookie, token);

    expect(parseBody(invitePreviewSchema, res)).toEqual({
      board: { id: s.board.id, title: s.board.title, color: s.board.color },
      role: 'viewer',
      email: 'sam@example.com',
      invitedBy: { name: 'Priya' },
    });
  });

  it('joins the board with the invited role', async () => {
    const s = await setup();
    const { token } = await invite(s, { email: 'sam@example.com', role: 'viewer' });

    const res = await accept(s.inviteeCookie, token);

    expect(parseBody(acceptInviteResponseSchema, res)).toEqual({
      boardId: s.board.id,
      role: 'viewer',
    });
    const board = await request(app).get(`/boards/${s.board.id}`).set('Cookie', s.inviteeCookie);
    expect(parseBody(boardDetailSchema, board).board).toMatchObject({ myRole: 'viewer' });
    // Viewer means read-only.
    const write = await request(app)
      .post(`/boards/${s.board.id}/lists`)
      .set('Cookie', s.inviteeCookie)
      .send({ title: 'Nope' });
    expect(write.status).toBe(403);
  });

  it('rejects a reused token', async () => {
    const s = await setup();
    const { token } = await invite(s);
    await accept(s.inviteeCookie, token).expect(200);

    expectError(await accept(s.inviteeCookie, token), 410, 'INVITE_USED');
  });

  it('lets only one of two simultaneous accepts through', async () => {
    const s = await setup();
    const { token } = await invite(s);

    const results = await Promise.all([
      accept(s.inviteeCookie, token),
      accept(s.inviteeCookie, token),
    ]);

    expect(results.map((res) => res.status).sort()).toEqual([200, 410]);
  });

  it('rejects an expired token', async () => {
    const s = await setup();
    const { invite: dto, token } = await invite(s);
    await InviteModel.updateOne({ _id: dto.id }, { expiresAt: new Date(Date.now() - 1000) });

    expectError(await preview(s.inviteeCookie, token), 410, 'INVITE_EXPIRED');
    expectError(await accept(s.inviteeCookie, token), 410, 'INVITE_EXPIRED');
  });

  it('rejects a revoked token, and says revoked even after it has also expired', async () => {
    const s = await setup();
    const { invite: dto, token } = await invite(s);
    await request(app)
      .delete(`/boards/${s.board.id}/invites/${dto.id}`)
      .set('Cookie', s.ownerCookie)
      .expect(204);
    await InviteModel.updateOne({ _id: dto.id }, { expiresAt: new Date(Date.now() - 1000) });

    expectError(await accept(s.inviteeCookie, token), 410, 'INVITE_REVOKED');
  });

  it('rejects an unknown token', async () => {
    const s = await setup();
    expectError(await accept(s.inviteeCookie, 'not-a-real-token'), 404, 'INVITE_NOT_FOUND');
  });

  it('rejects another account and leaves the invite usable', async () => {
    const s = await setup();
    const { token } = await invite(s);
    const stranger = await createUser({ email: 'other@example.com' });

    const res = await accept(await accessCookieFor(stranger), token);

    expectError(res, 403, 'INVITE_WRONG_ACCOUNT');
    expect(errorOf(res).message).toContain('sam@example.com');
    expect((await accept(s.inviteeCookie, token)).status).toBe(200);
  });

  it('keeps the role of someone who is already a member', async () => {
    const s = await setup();
    const { token } = await invite(s, { email: 'sam@example.com', role: 'viewer' });
    await s.board.updateOne({ $push: { members: { userId: s.invitee._id, role: 'member' } } });

    const res = await accept(s.inviteeCookie, token);

    expect(parseBody(acceptInviteResponseSchema, res).role).toBe('member');
  });

  it('requires a signed-in user', async () => {
    const s = await setup();
    const { token } = await invite(s);
    expect((await request(app).post(`/invites/${token}/accept`)).status).toBe(401);
  });
});

describe('resend and revoke', () => {
  it('resending replaces the link: the old one stops working, the new one works', async () => {
    const s = await setup();
    const first = await invite(s);

    const res = await request(app)
      .post(`/boards/${s.board.id}/invites/${first.invite.id}/resend`)
      .set('Cookie', s.ownerCookie);

    const second = parseBody(inviteWithLinkResponseSchema, res);
    const token = second.link.split('/invite/')[1] ?? '';
    expect(token).not.toBe(first.token);
    expectError(await accept(s.inviteeCookie, first.token), 404, 'INVITE_NOT_FOUND');
    expect((await accept(s.inviteeCookie, token)).status).toBe(200);
  });

  it('resending revives an expired invite', async () => {
    const s = await setup();
    const { invite: dto } = await invite(s);
    await InviteModel.updateOne({ _id: dto.id }, { expiresAt: new Date(Date.now() - 1000) });

    const res = await request(app)
      .post(`/boards/${s.board.id}/invites/${dto.id}/resend`)
      .set('Cookie', s.ownerCookie);

    expect(
      Date.parse(parseBody(inviteWithLinkResponseSchema, res).invite.expiresAt),
    ).toBeGreaterThan(Date.now());
  });

  it('cannot resend or revoke an invite that was used, revoked or belongs to another board', async () => {
    const s = await setup();
    const used = await invite(s);
    await accept(s.inviteeCookie, used.token).expect(200);
    const otherBoard = await createBoard(s.owner);
    const elsewhere = await request(app)
      .post(`/boards/${otherBoard.id}/invites`)
      .set('Cookie', s.ownerCookie)
      .send({ email: 'x@example.com' });
    const elsewhereId = parseBody(inviteWithLinkResponseSchema, elsewhere).invite.id;

    for (const id of [used.invite.id, elsewhereId, 'not-an-id']) {
      const resend = await request(app)
        .post(`/boards/${s.board.id}/invites/${id}/resend`)
        .set('Cookie', s.ownerCookie);
      expectError(resend, 404, 'NOT_FOUND');
      const revoke = await request(app)
        .delete(`/boards/${s.board.id}/invites/${id}`)
        .set('Cookie', s.ownerCookie);
      expectError(revoke, 404, 'NOT_FOUND');
    }
  });
});

it('deleting a board deletes its invites', async () => {
  const s = await setup();
  const { token } = await invite(s);

  await request(app).delete(`/boards/${s.board.id}`).set('Cookie', s.ownerCookie).expect(204);

  expect(await InviteModel.countDocuments()).toBe(0);
  expectError(await accept(s.inviteeCookie, token), 404, 'INVITE_NOT_FOUND');
});
