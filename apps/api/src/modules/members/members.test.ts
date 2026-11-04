import { membersResponseSchema } from '@taskboard/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  accessCookieFor,
  createBoardWithRoles,
  createCard,
  createList,
  errorOf,
  parseBody,
} from '../../../test/factories.js';
import { createApp } from '../../app.js';
import { BoardModel } from '../boards/model.js';
import { CardModel } from '../cards/model.js';

let app: ReturnType<typeof createApp>;
beforeEach(() => {
  app = createApp();
});

async function setup() {
  const fixture = await createBoardWithRoles();
  return { ...fixture, ownerCookie: await accessCookieFor(fixture.owner) };
}

const changeRole = (cookie: string, boardId: string, userId: string, role: string) =>
  request(app).patch(`/boards/${boardId}/members/${userId}`).set('Cookie', cookie).send({ role });

const remove = (cookie: string, boardId: string, userId: string) =>
  request(app).delete(`/boards/${boardId}/members/${userId}`).set('Cookie', cookie);

async function roleOf(boardId: string, userId: string) {
  const board = await BoardModel.findById(boardId).lean();
  return board?.members.find((member) => member.userId.toString() === userId)?.role ?? null;
}

describe('PATCH /boards/:boardId/members/:userId', () => {
  it('changes a role and returns the new member list', async () => {
    const { board, viewer, ownerCookie } = await setup();

    const res = await changeRole(ownerCookie, board.id, viewer.id, 'member');

    const { members } = parseBody(membersResponseSchema, res);
    expect(members.find((member) => member.id === viewer.id)).toMatchObject({
      name: 'Viewer',
      role: 'member',
    });
    // The new role applies straight away.
    const write = await request(app)
      .post(`/boards/${board.id}/lists`)
      .set('Cookie', await accessCookieFor(viewer))
      .send({ title: 'Now allowed' });
    expect(write.status).toBe(201);
  });

  it('lets an owner step down once someone else is an owner', async () => {
    const { board, owner, member, ownerCookie } = await setup();
    await changeRole(ownerCookie, board.id, member.id, 'owner').expect(200);

    await changeRole(ownerCookie, board.id, owner.id, 'member').expect(200);

    expect(await roleOf(board.id, owner.id)).toBe('member');
  });

  it('refuses to demote the last owner', async () => {
    const { board, owner, ownerCookie } = await setup();

    const res = await changeRole(ownerCookie, board.id, owner.id, 'member');

    expect(res.status).toBe(409);
    expect(errorOf(res).code).toBe('LAST_OWNER');
    expect(await roleOf(board.id, owner.id)).toBe('owner');
  });

  it('never leaves a board without an owner when two owners demote each other at once', async () => {
    const { board, owner, member, ownerCookie } = await setup();
    await changeRole(ownerCookie, board.id, member.id, 'owner').expect(200);
    const memberCookie = await accessCookieFor(member);

    const results = await Promise.all([
      changeRole(ownerCookie, board.id, member.id, 'viewer'),
      changeRole(memberCookie, board.id, owner.id, 'viewer'),
    ]);

    expect(results.map((res) => res.status).sort()).toEqual([200, 409]);
    const roles = [await roleOf(board.id, owner.id), await roleOf(board.id, member.id)];
    expect(roles.filter((role) => role === 'owner')).toHaveLength(1);
  });

  it.each(['admin', '', undefined])('rejects role %s', async (role) => {
    const { board, member, ownerCookie } = await setup();
    const res = await request(app)
      .patch(`/boards/${board.id}/members/${member.id}`)
      .set('Cookie', ownerCookie)
      .send(role === undefined ? {} : { role });
    expect(res.status).toBe(400);
  });

  it.each([
    ['not a member', (f: Awaited<ReturnType<typeof setup>>) => f.outsider.id],
    ['malformed', () => 'nope'],
  ])('returns 404 for a user who is %s', async (_name, target) => {
    const fixture = await setup();
    const res = await changeRole(fixture.ownerCookie, fixture.board.id, target(fixture), 'viewer');
    expect(res.status).toBe(404);
  });
});

describe('DELETE /boards/:boardId/members/:userId', () => {
  it('removes a member, who then loses access', async () => {
    const { board, member, ownerCookie } = await setup();

    const res = await remove(ownerCookie, board.id, member.id);

    const ids = parseBody(membersResponseSchema, res).members.map((item) => item.id);
    expect(ids).not.toContain(member.id);
    const after = await request(app)
      .get(`/boards/${board.id}`)
      .set('Cookie', await accessCookieFor(member));
    expect(after.status).toBe(404);
  });

  it('takes them off the cards they were assigned to', async () => {
    const { board, owner, member, ownerCookie } = await setup();
    const card = await createCard(await createList(board._id));
    await card.updateOne({ assignees: [member._id, owner._id] });

    await remove(ownerCookie, board.id, member.id).expect(200);

    const updated = await CardModel.findById(card._id).lean();
    expect(updated?.assignees.map(String)).toEqual([owner.id]);
    expect(updated?.version).toBe(card.version + 1);
  });

  it('refuses to remove the last owner', async () => {
    const { board, owner, ownerCookie } = await setup();

    const res = await remove(ownerCookie, board.id, owner.id);

    expect(res.status).toBe(409);
    expect(errorOf(res).code).toBe('LAST_OWNER');
  });

  it('returns 404 for someone who is not a member', async () => {
    const { board, outsider, ownerCookie } = await setup();
    expect((await remove(ownerCookie, board.id, outsider.id)).status).toBe(404);
  });
});
