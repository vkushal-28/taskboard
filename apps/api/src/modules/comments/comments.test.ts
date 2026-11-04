import {
  activityPageSchema,
  boardDetailSchema,
  commentPageSchema,
  createCommentResponseSchema,
  COMMENT_MAX_LENGTH,
} from '@taskboard/shared';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
import { CardModel } from '../cards/model.js';
import { UserModel } from '../users/model.js';
import { CommentModel } from './model.js';

let app: ReturnType<typeof createApp>;
beforeEach(() => {
  app = createApp();
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function setup() {
  const owner = await createUser({ name: 'Priya' });
  const board = await createBoard(owner);
  const list = await createList(board._id);
  const card = await createCard(list, { title: 'Login page' });
  return { owner, board, list, card, cookie: await accessCookieFor(owner) };
}

async function post(cookie: string, cardId: string, body: object) {
  return request(app).post(`/cards/${cardId}/comments`).set('Cookie', cookie).send(body);
}

async function addComments(cookie: string, cardId: string, bodies: string[]) {
  // In sequence, so each comment's id is newer than the one before.
  for (const body of bodies) {
    expect((await post(cookie, cardId, { body })).status).toBe(201);
  }
}

async function page(cookie: string, cardId: string, query = '') {
  const res = await request(app).get(`/cards/${cardId}/comments${query}`).set('Cookie', cookie);
  expect(res.status).toBe(200);
  return parseBody(commentPageSchema, res);
}

describe('POST /cards/:cardId/comments', () => {
  it('saves a trimmed comment and bumps the card count and version', async () => {
    const { owner, board, card, cookie } = await setup();

    const res = await post(cookie, card.id, { body: '  Looks good  ' });

    expect(res.status).toBe(201);
    const { comment, card: updated } = parseBody(createCommentResponseSchema, res);
    expect(comment).toMatchObject({
      boardId: board.id,
      cardId: card.id,
      author: { id: owner.id, name: 'Priya' },
      body: 'Looks good',
    });
    expect(updated).toMatchObject({ id: card.id, commentCount: 1, version: card.version + 1 });
    expect(await CommentModel.countDocuments({ cardId: card._id })).toBe(1);
  });

  it('shows the count in the board detail', async () => {
    const { board, card, cookie } = await setup();
    await addComments(cookie, card.id, ['one', 'two']);

    const res = await request(app).get(`/boards/${board.id}`).set('Cookie', cookie);

    const detail = parseBody(boardDetailSchema, res);
    expect(detail.cards.find((item) => item.id === card.id)?.commentCount).toBe(2);
  });

  it('logs a comment.created activity on the card', async () => {
    const { card, cookie } = await setup();
    await addComments(cookie, card.id, ['First']);

    const res = await request(app).get(`/cards/${card.id}/activity`).set('Cookie', cookie);

    const [latest] = parseBody(activityPageSchema, res).activity;
    expect(latest).toMatchObject({
      type: 'comment.created',
      card: { id: card.id, title: 'Login page' },
    });
  });

  it.each([
    ['an empty body', { body: '' }],
    ['only whitespace', { body: '   ' }],
    ['a body over the limit', { body: 'x'.repeat(COMMENT_MAX_LENGTH + 1) }],
    ['no body', {}],
  ])('rejects %s', async (_name, body) => {
    const { card, cookie } = await setup();

    const res = await post(cookie, card.id, body);

    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe('VALIDATION_ERROR');
    expect(await CommentModel.countDocuments()).toBe(0);
  });

  it('returns 404 and keeps no comment when the card is deleted mid-request', async () => {
    const { card, cookie } = await setup();
    // Someone deletes the card after the role check passed, while the comment is being saved.
    const realCreate = CommentModel.create.bind(CommentModel);
    vi.spyOn(CommentModel, 'create').mockImplementationOnce((async (doc: object) => {
      await CardModel.deleteOne({ _id: card._id });
      return realCreate(doc);
    }) as typeof CommentModel.create);

    const res = await post(cookie, card.id, { body: 'Too late' });

    expect(res.status).toBe(404);
    expect(await CommentModel.countDocuments()).toBe(0);
  });
});

describe('GET /cards/:cardId/comments', () => {
  it('returns newest first, one page at a time, with no gaps or repeats', async () => {
    const { card, cookie } = await setup();
    await addComments(cookie, card.id, ['1', '2', '3', '4', '5']);

    const first = await page(cookie, card.id, '?limit=2');
    const second = await page(cookie, card.id, `?limit=2&cursor=${first.nextCursor}`);
    const last = await page(cookie, card.id, `?limit=2&cursor=${second.nextCursor}`);

    expect([first, second, last].map((p) => p.comments.map((c) => c.body))).toEqual([
      ['5', '4'],
      ['3', '2'],
      ['1'],
    ]);
    expect(last.nextCursor).toBeNull();
  });

  it('has no next page when the last page is exactly full', async () => {
    const { card, cookie } = await setup();
    await addComments(cookie, card.id, ['1', '2']);

    expect((await page(cookie, card.id, '?limit=2')).nextCursor).toBeNull();
  });

  it("only returns this card's comments", async () => {
    const { list, card, cookie } = await setup();
    const other = await createCard(list);
    await addComments(cookie, other.id, ['elsewhere']);
    await addComments(cookie, card.id, ['here']);

    const { comments } = await page(cookie, card.id);

    expect(comments.map((comment) => comment.body)).toEqual(['here']);
  });

  it('returns a null author once the user is gone', async () => {
    const { card, cookie } = await setup();
    const alex = await createUser();
    await CommentModel.create({
      boardId: card.boardId,
      cardId: card._id,
      authorId: alex._id,
      body: 'Orphan',
    });
    await UserModel.deleteOne({ _id: alex._id });

    const [comment] = (await page(cookie, card.id)).comments;

    expect(comment?.author).toBeNull();
  });

  it.each(['cursor=nope', 'limit=0', 'limit=51'])('rejects %s', async (query) => {
    const { card, cookie } = await setup();

    const res = await request(app).get(`/cards/${card.id}/comments?${query}`).set('Cookie', cookie);

    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe('VALIDATION_ERROR');
  });
});

describe('deleting comments with their parents', () => {
  it('deletes a card with its comments', async () => {
    const { list, card, cookie } = await setup();
    const kept = await createCard(list);
    await addComments(cookie, card.id, ['gone']);
    await addComments(cookie, kept.id, ['kept']);

    await request(app).delete(`/cards/${card.id}`).set('Cookie', cookie).expect(204);

    const left = await CommentModel.find().lean();
    expect(left.map((comment) => comment.body)).toEqual(['kept']);
  });

  it("deletes a list with its cards' comments", async () => {
    const { board, list, card, cookie } = await setup();
    const otherList = await createList(board._id);
    const kept = await createCard(otherList);
    await addComments(cookie, card.id, ['gone']);
    await addComments(cookie, kept.id, ['kept']);

    await request(app).delete(`/lists/${list.id}`).set('Cookie', cookie).expect(204);

    const left = await CommentModel.find().lean();
    expect(left.map((comment) => comment.body)).toEqual(['kept']);
  });

  it('deletes a board with its comments', async () => {
    const { board, card, cookie } = await setup();
    await addComments(cookie, card.id, ['gone']);

    await request(app).delete(`/boards/${board.id}`).set('Cookie', cookie).expect(204);

    expect(await CommentModel.countDocuments()).toBe(0);
  });
});
