import { activityPageSchema } from '@taskboard/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  accessCookieFor,
  createBoard,
  createList,
  createUser,
  errorOf,
  parseBody,
} from '../../../test/factories.js';
import { createApp } from '../../app.js';

// Only the ids matter here; the full schemas are tested in their own modules.
const listShape = z.object({ list: z.object({ id: z.string() }) });
const cardShape = z.object({ card: z.object({ id: z.string() }) });

let app: ReturnType<typeof createApp>;
beforeEach(() => {
  app = createApp();
});

async function setup() {
  const owner = await createUser({ name: 'Priya' });
  const board = await createBoard(owner);
  const cookie = await accessCookieFor(owner);
  // Through the api, so each write logs its activity like in real use.
  const list = parseBody(
    listShape,
    await request(app)
      .post(`/boards/${board.id}/lists`)
      .set('Cookie', cookie)
      .send({ title: 'To do' }),
  ).list;
  return { owner, board, list, cookie };
}

async function addCard(cookie: string, listId: string, title: string) {
  const res = await request(app)
    .post(`/lists/${listId}/cards`)
    .set('Cookie', cookie)
    .send({ title });
  return parseBody(cardShape, res).card.id;
}

async function feed(cookie: string, path: string) {
  const res = await request(app).get(path).set('Cookie', cookie);
  expect(res.status).toBe(200);
  return parseBody(activityPageSchema, res);
}

describe('GET /boards/:boardId/activity', () => {
  it('pages through the board newest first', async () => {
    const { board, list, cookie } = await setup();
    await addCard(cookie, list.id, 'A');
    await addCard(cookie, list.id, 'B');

    const first = await feed(cookie, `/boards/${board.id}/activity?limit=2`);
    const rest = await feed(
      cookie,
      `/boards/${board.id}/activity?limit=2&cursor=${first.nextCursor}`,
    );

    expect(first.activity.map((item) => [item.type, item.card?.title])).toEqual([
      ['card.created', 'B'],
      ['card.created', 'A'],
    ]);
    expect(rest.activity.map((item) => item.type)).toEqual(['list.created']);
    expect(rest.nextCursor).toBeNull();
    expect(first.activity[0]).toMatchObject({
      actor: { name: 'Priya' },
      board: { id: board.id },
      list: { id: list.id, title: 'To do' },
    });
  });

  it('does not show activity from other boards', async () => {
    const { owner, board, cookie } = await setup();
    const other = await createBoard(owner);
    const otherList = await createList(other._id);
    await addCard(cookie, otherList.id, 'Elsewhere');

    const { activity } = await feed(cookie, `/boards/${board.id}/activity`);

    expect(activity.map((item) => item.type)).toEqual(['list.created']);
  });

  it('rejects a malformed cursor', async () => {
    const { board, cookie } = await setup();

    const res = await request(app)
      .get(`/boards/${board.id}/activity?cursor=abc`)
      .set('Cookie', cookie);

    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /cards/:cardId/activity', () => {
  it("returns only that card's history, comments included", async () => {
    const { list, cookie } = await setup();
    const cardId = await addCard(cookie, list.id, 'Login page');
    const otherId = await addCard(cookie, list.id, 'Other');
    await request(app).patch(`/cards/${otherId}`).set('Cookie', cookie).send({ title: 'Renamed' });
    await request(app).patch(`/cards/${cardId}`).set('Cookie', cookie).send({ description: 'Hi' });
    await request(app).post(`/cards/${cardId}/comments`).set('Cookie', cookie).send({ body: 'Ok' });

    const { activity, nextCursor } = await feed(cookie, `/cards/${cardId}/activity`);

    expect(activity.map((item) => item.type)).toEqual([
      'comment.created',
      'card.updated',
      'card.created',
    ]);
    expect(activity.every((item) => item.card?.id === cardId)).toBe(true);
    expect(nextCursor).toBeNull();
  });

  it('keeps the history of an archived card readable', async () => {
    const { list, cookie } = await setup();
    const cardId = await addCard(cookie, list.id, 'Old');
    await request(app).patch(`/cards/${cardId}`).set('Cookie', cookie).send({ archived: true });

    const { activity } = await feed(cookie, `/cards/${cardId}/activity`);

    expect(activity.map((item) => item.type)).toEqual(['card.archived', 'card.created']);
  });
});
