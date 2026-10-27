import { recentActivityResponseSchema } from '@taskboard/shared';
import { Types } from 'mongoose';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  accessCookieFor,
  createBoard,
  createCard,
  createList,
  createUser,
  errorOf,
  parseBody,
} from '../../../test/factories.js';
import { createApp } from '../../app.js';
import { ActivityModel } from './model.js';

let app: ReturnType<typeof createApp>;
beforeEach(() => {
  app = createApp();
});

async function recentActivity(cookie: string, query = '') {
  const res = await request(app).get(`/activity/recent${query}`).set('Cookie', cookie);
  expect(res.status).toBe(200);
  return parseBody(recentActivityResponseSchema, res).activity;
}

// Raw inserts with explicit timestamps; rows written through the api in one test can share a
// millisecond, which would make "newest first" untestable.
async function insertActivity(boardId: Types.ObjectId, actorId: Types.ObjectId, ages: number[]) {
  const now = Date.now();
  await ActivityModel.collection.insertMany(
    ages.map((secondsAgo) => ({
      boardId,
      actorId,
      cardId: null,
      type: 'board.updated',
      meta: { secondsAgo },
      createdAt: new Date(now - secondsAgo * 1000),
    })),
  );
}

describe('GET /activity/recent', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/activity/recent');

    expect(res.status).toBe(401);
  });

  it('returns an empty list for a user without boards', async () => {
    const user = await createUser();

    expect(await recentActivity(await accessCookieFor(user))).toEqual([]);
  });

  it('only returns activity from boards the user is a member of', async () => {
    const [me, stranger] = await Promise.all([createUser(), createUser()]);
    const mine = await createBoard(stranger, [{ user: me, role: 'viewer' }]);
    const theirs = await createBoard(stranger);
    await insertActivity(mine._id, stranger._id, [10]);
    await insertActivity(theirs._id, stranger._id, [5]);

    const activity = await recentActivity(await accessCookieFor(me));

    expect(activity.map((item) => item.board.id)).toEqual([mine.id]);
  });

  it('returns the newest first across boards and respects the limit', async () => {
    const me = await createUser();
    const [first, second] = await Promise.all([createBoard(me), createBoard(me)]);
    await insertActivity(first._id, me._id, [40, 10]);
    await insertActivity(second._id, me._id, [30, 20]);
    const cookie = await accessCookieFor(me);

    const all = await recentActivity(cookie);
    const latestTwo = await recentActivity(cookie, '?limit=2');

    const timestamps = all.map((item) => Date.parse(item.createdAt));
    expect(timestamps).toEqual([...timestamps].sort((a, b) => b - a));
    expect(all.map((item) => item.board.id)).toEqual([first.id, second.id, second.id, first.id]);
    expect(latestTwo).toEqual(all.slice(0, 2));
  });

  it.each(['0', '51', 'abc'])('rejects limit=%s', async (limit) => {
    const user = await createUser();
    const res = await request(app)
      .get(`/activity/recent?limit=${limit}`)
      .set('Cookie', await accessCookieFor(user));

    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe('VALIDATION_ERROR');
  });

  it('resolves the actor, board, card and target list of a move', async () => {
    const priya = await createUser({ name: 'Priya' });
    const board = await createBoard(priya);
    // In sequence: createList picks the position after the current last list.
    const todo = await createList(board._id);
    const done = await createList(board._id);
    await done.updateOne({ title: 'Done' });
    const card = await createCard(todo, { title: 'Login page' });
    const cookie = await accessCookieFor(priya);

    const move = await request(app)
      .patch(`/cards/${card.id}/move`)
      .set('Cookie', cookie)
      .send({ listId: done.id });
    expect(move.status).toBe(200);

    const [latest] = await recentActivity(cookie, '?limit=1');
    expect(latest).toMatchObject({
      type: 'card.moved',
      actor: { id: priya.id, name: 'Priya' },
      board: { id: board.id, title: board.title, color: board.color },
      card: { id: card.id, title: 'Login page' },
      list: { id: done.id, title: 'Done' },
    });
  });

  it('falls back to the saved title for deleted cards and lists', async () => {
    const owner = await createUser();
    const board = await createBoard(owner);
    const list = await createList(board._id);
    const card = await createCard(list, { title: 'Old card' });
    const cookie = await accessCookieFor(owner);

    expect((await request(app).delete(`/cards/${card.id}`).set('Cookie', cookie)).status).toBe(204);
    expect((await request(app).delete(`/lists/${list.id}`).set('Cookie', cookie)).status).toBe(204);

    const activity = await recentActivity(cookie);
    expect(activity.find((item) => item.type === 'card.deleted')?.card).toEqual({
      id: card.id,
      title: 'Old card',
    });
    expect(activity.find((item) => item.type === 'list.deleted')?.list).toEqual({
      id: list.id,
      title: list.title,
    });
  });

  it('returns null for references that no longer resolve', async () => {
    const owner = await createUser();
    const board = await createBoard(owner);
    await ActivityModel.create({
      boardId: board._id,
      actorId: new Types.ObjectId(),
      cardId: new Types.ObjectId(),
      type: 'card.updated',
      meta: { fields: ['title'] },
    });

    const [item] = await recentActivity(await accessCookieFor(owner));

    expect(item).toMatchObject({ actor: null, card: null, list: null });
  });
});
