import { cardDtoSchema } from '@taskboard/shared';
import { Error as MongooseError, Types } from 'mongoose';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  accessCookieFor,
  createBoard,
  createBoardWithRoles,
  createCard,
  createList,
  errorOf,
  parseBody,
} from '../../../test/factories.js';
import { createApp } from '../../app.js';
import { positionBetween } from '../../lib/position.js';
import { ActivityModel } from '../activity/model.js';
import { BY_POSITION } from '../boards/service.js';
import { CardModel } from './model.js';

const cardBodySchema = z.object({ card: cardDtoSchema });

let app: ReturnType<typeof createApp>;
beforeEach(() => {
  app = createApp();
});
afterEach(() => {
  vi.restoreAllMocks();
});

/** Ids of the visible cards in a list, in display order. */
async function cardOrder(listId: Types.ObjectId): Promise<string[]> {
  const cards = await CardModel.find({ listId, archived: false }).sort(BY_POSITION).lean();
  return cards.map((card) => card._id.toString());
}

/** List `todo` holds cards A, B, C in order; list `done` is empty. Acts as a member. */
async function boardWithCards() {
  const setup = await createBoardWithRoles();
  const todo = await createList(setup.board._id);
  const done = await createList(setup.board._id);
  const a = await createCard(todo, { title: 'A' });
  const b = await createCard(todo, { title: 'B' });
  const c = await createCard(todo, { title: 'C' });
  return { ...setup, todo, done, a, b, c, cookie: await accessCookieFor(setup.member) };
}

describe('POST /lists/:listId/cards', () => {
  it('adds the card after the last one, archived cards included', async () => {
    const { board, todo, c, cookie } = await boardWithCards();
    const archived = await createCard(todo, { archived: true });

    const res = await request(app)
      .post(`/lists/${todo.id}/cards`)
      .set('Cookie', cookie)
      .send({ title: 'D' });

    expect(res.status).toBe(201);
    const { card } = parseBody(cardBodySchema, res);
    expect(card).toMatchObject({ boardId: board.id, listId: todo.id, title: 'D', description: '' });
    expect(card.position > archived.position && archived.position > c.position).toBe(true);
    expect(await ActivityModel.findOne({ cardId: card.id }).lean()).toMatchObject({
      type: 'card.created',
    });
  });

  it('gives concurrent creates distinct positions', async () => {
    const { todo, cookie } = await boardWithCards();
    const responses = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        request(app)
          .post(`/lists/${todo.id}/cards`)
          .set('Cookie', cookie)
          .send({ title: `N${i}` }),
      ),
    );

    expect(responses.map((res) => res.status)).toEqual([201, 201, 201, 201, 201]);
    const positions = responses.map((res) => parseBody(cardBodySchema, res).card.position);
    expect(new Set(positions).size).toBe(5);
  });

  it('forbids a viewer', async () => {
    const { todo, viewer } = await boardWithCards();
    const res = await request(app)
      .post(`/lists/${todo.id}/cards`)
      .set('Cookie', await accessCookieFor(viewer))
      .send({ title: 'Nope' });
    expect(res.status).toBe(403);
  });

  it('rejects an empty title', async () => {
    const { todo, cookie } = await boardWithCards();
    const res = await request(app)
      .post(`/lists/${todo.id}/cards`)
      .set('Cookie', cookie)
      .send({ title: '' });
    expect(res.status).toBe(400);
  });
});

describe('GET /cards/:cardId', () => {
  it('lets a viewer read a card, archived or not', async () => {
    const { todo, viewer } = await boardWithCards();
    const archived = await createCard(todo, { archived: true });

    const res = await request(app)
      .get(`/cards/${archived.id}`)
      .set('Cookie', await accessCookieFor(viewer));

    expect(res.status).toBe(200);
    expect(parseBody(cardBodySchema, res).card).toMatchObject({ id: archived.id, archived: true });
  });
});

describe('PATCH /cards/:cardId', () => {
  it('updates details and logs the changed fields', async () => {
    const { a, cookie } = await boardWithCards();
    const res = await request(app)
      .patch(`/cards/${a.id}`)
      .set('Cookie', cookie)
      .send({
        title: 'Hero section',
        description: 'New layout',
        labels: [{ name: 'Design', color: '#9333ea' }],
        dueDate: '2026-11-01T17:00:00.000Z',
        checklist: [{ text: 'Wireframe' }, { text: 'Copy', done: true }],
      });

    expect(res.status).toBe(200);
    const { card } = parseBody(cardBodySchema, res);
    expect(card).toMatchObject({
      title: 'Hero section',
      description: 'New layout',
      labels: [{ name: 'Design', color: '#9333ea' }],
      dueDate: '2026-11-01T17:00:00.000Z',
      checklist: [
        { text: 'Wireframe', done: false },
        { text: 'Copy', done: true },
      ],
    });
    expect(await ActivityModel.findOne({ cardId: a._id }).lean()).toMatchObject({
      type: 'card.updated',
      meta: { fields: ['title', 'description', 'labels', 'dueDate', 'checklist'] },
    });
  });

  it('keeps checklist item ids that are sent back', async () => {
    const { a, cookie } = await boardWithCards();
    const first = await request(app)
      .patch(`/cards/${a.id}`)
      .set('Cookie', cookie)
      .send({ checklist: [{ text: 'Wireframe' }] });
    const [item] = parseBody(cardBodySchema, first).card.checklist;
    if (!item) throw new Error('checklist item missing');

    const res = await request(app)
      .patch(`/cards/${a.id}`)
      .set('Cookie', cookie)
      .send({ checklist: [{ id: item.id, text: 'Wireframe', done: true }, { text: 'Copy' }] });

    const { checklist } = parseBody(cardBodySchema, res).card;
    expect(checklist[0]).toEqual({ id: item.id, text: 'Wireframe', done: true });
    expect(checklist[1]?.id).not.toBe(item.id);
  });

  it('clears the due date with null', async () => {
    const { a, cookie } = await boardWithCards();
    await CardModel.updateOne({ _id: a._id }, { dueDate: new Date() });
    const res = await request(app)
      .patch(`/cards/${a.id}`)
      .set('Cookie', cookie)
      .send({ dueDate: null });
    expect(parseBody(cardBodySchema, res).card.dueDate).toBeNull();
  });

  it('assigns board members once each', async () => {
    const { a, owner, member, cookie } = await boardWithCards();
    const res = await request(app)
      .patch(`/cards/${a.id}`)
      .set('Cookie', cookie)
      .send({ assignees: [owner.id, member.id, owner.id] });

    expect(res.status).toBe(200);
    expect(parseBody(cardBodySchema, res).card.assignees).toEqual([owner.id, member.id]);
  });

  it('rejects an assignee who is not a member', async () => {
    const { a, outsider, cookie } = await boardWithCards();
    const res = await request(app)
      .patch(`/cards/${a.id}`)
      .set('Cookie', cookie)
      .send({ assignees: [outsider.id] });

    expect(res.status).toBe(400);
    expect((await CardModel.findById(a._id).lean())?.assignees).toEqual([]);
  });

  it('archives and restores a card', async () => {
    const { a, cookie } = await boardWithCards();
    const archived = await request(app)
      .patch(`/cards/${a.id}`)
      .set('Cookie', cookie)
      .send({ archived: true });
    expect(parseBody(cardBodySchema, archived).card.archived).toBe(true);

    await request(app).patch(`/cards/${a.id}`).set('Cookie', cookie).send({ archived: false });

    const activity = await ActivityModel.find({ cardId: a._id })
      .sort({ createdAt: 1, _id: 1 })
      .lean();
    expect(activity.map((entry) => entry.type)).toEqual(['card.archived', 'card.restored']);
  });

  it('returns 404 when the card is deleted while being saved', async () => {
    const { a, cookie } = await boardWithCards();
    vi.spyOn(CardModel.prototype, 'save').mockRejectedValueOnce(
      new MongooseError.DocumentNotFoundError('No card matches the save'),
    );

    const res = await request(app)
      .patch(`/cards/${a.id}`)
      .set('Cookie', cookie)
      .send({ title: 'X' });

    expect(res.status).toBe(404);
    expect(errorOf(res).code).toBe('NOT_FOUND');
  });

  it('rejects an empty update', async () => {
    const { a, cookie } = await boardWithCards();
    const res = await request(app).patch(`/cards/${a.id}`).set('Cookie', cookie).send({});
    expect(res.status).toBe(400);
  });

  it('forbids a viewer', async () => {
    const { a, viewer } = await boardWithCards();
    const res = await request(app)
      .patch(`/cards/${a.id}`)
      .set('Cookie', await accessCookieFor(viewer))
      .send({ title: 'Nope' });
    expect(res.status).toBe(403);
  });
});

describe('PATCH /cards/:cardId/move', () => {
  it('moves a card to the front of its list, writing only that card', async () => {
    const { todo, a, b, c, cookie } = await boardWithCards();
    const res = await request(app)
      .patch(`/cards/${c.id}/move`)
      .set('Cookie', cookie)
      .send({ listId: todo.id, afterId: a.id });

    expect(res.status).toBe(200);
    expect(await cardOrder(todo._id)).toEqual([c.id, a.id, b.id]);
    const others = await CardModel.find({ _id: { $in: [a._id, b._id] } })
      .sort(BY_POSITION)
      .lean();
    expect(others.map((card) => card.position)).toEqual([a.position, b.position]);
  });

  it('moves a card to the end of its list', async () => {
    const { todo, a, b, c, cookie } = await boardWithCards();
    const res = await request(app)
      .patch(`/cards/${a.id}/move`)
      .set('Cookie', cookie)
      .send({ listId: todo.id, beforeId: c.id });

    expect(res.status).toBe(200);
    expect(await cardOrder(todo._id)).toEqual([b.id, c.id, a.id]);
  });

  it('moves a card into an empty list and logs both lists', async () => {
    const { todo, done, a, b, c, cookie } = await boardWithCards();
    const res = await request(app)
      .patch(`/cards/${b.id}/move`)
      .set('Cookie', cookie)
      .send({ listId: done.id });

    expect(res.status).toBe(200);
    expect(parseBody(cardBodySchema, res).card.listId).toBe(done.id);
    expect(await cardOrder(done._id)).toEqual([b.id]);
    expect(await cardOrder(todo._id)).toEqual([a.id, c.id]);
    expect(await ActivityModel.findOne({ cardId: b._id }).lean()).toMatchObject({
      type: 'card.moved',
      meta: { fromListId: todo.id, toListId: done.id },
    });
  });

  it('moves a card between two cards of another list', async () => {
    const { done, a, cookie } = await boardWithCards();
    const x = await createCard(done);
    const y = await createCard(done);

    const res = await request(app)
      .patch(`/cards/${a.id}/move`)
      .set('Cookie', cookie)
      .send({ listId: done.id, beforeId: x.id, afterId: y.id });

    expect(res.status).toBe(200);
    expect(await cardOrder(done._id)).toEqual([x.id, a.id, y.id]);
  });

  it('retries when an archived card already holds the computed position', async () => {
    const { todo, a, b, c, cookie } = await boardWithCards();
    // Exactly the key the server will try first for a gap between A and B.
    const hidden = await createCard(todo, {
      archived: true,
      position: positionBetween(a.position, b.position),
    });

    const res = await request(app)
      .patch(`/cards/${c.id}/move`)
      .set('Cookie', cookie)
      .send({ listId: todo.id, beforeId: a.id, afterId: b.id });

    expect(res.status).toBe(200);
    const { position } = parseBody(cardBodySchema, res).card;
    expect(position > hidden.position && position < b.position).toBe(true);
    expect(await cardOrder(todo._id)).toEqual([a.id, c.id, b.id]);
  });

  it('ignores archived cards when checking for a stale gap', async () => {
    const { todo, done, a, b, cookie } = await boardWithCards();
    await createCard(done, { archived: true });

    const res = await request(app)
      .patch(`/cards/${a.id}/move`)
      .set('Cookie', cookie)
      .send({ listId: done.id });

    expect(res.status).toBe(200);
    expect(await cardOrder(done._id)).toEqual([a.id]);
    expect(await cardOrder(todo._id)).toEqual([b.id, expect.any(String)]);
  });

  describe('returns 409 when the client view is stale', () => {
    it('another card sits between the neighbours', async () => {
      const { done, a, c, cookie } = await boardWithCards();
      const d = await createCard(done);
      const res = await request(app)
        .patch(`/cards/${d.id}/move`)
        .set('Cookie', cookie)
        .send({ listId: a.listId.toString(), beforeId: a.id, afterId: c.id });

      expect(res.status).toBe(409);
      expect(errorOf(res).code).toBe('CONFLICT');
    });

    it('the target list is not empty', async () => {
      const { todo, done, cookie } = await boardWithCards();
      const d = await createCard(done);
      const res = await request(app)
        .patch(`/cards/${d.id}/move`)
        .set('Cookie', cookie)
        .send({ listId: todo.id });
      expect(res.status).toBe(409);
    });

    it('the neighbour is in a different list', async () => {
      const { done, a, b, cookie } = await boardWithCards();
      const res = await request(app)
        .patch(`/cards/${a.id}/move`)
        .set('Cookie', cookie)
        .send({ listId: done.id, beforeId: b.id });
      expect(res.status).toBe(409);
    });

    it('the target list is on another board', async () => {
      const { owner, a, cookie } = await boardWithCards();
      const foreign = await createList((await createBoard(owner))._id);
      const res = await request(app)
        .patch(`/cards/${a.id}/move`)
        .set('Cookie', cookie)
        .send({ listId: foreign.id });

      expect(res.status).toBe(409);
      expect((await CardModel.findById(a._id).lean())?.listId.toString()).toBe(a.listId.toString());
    });

    it('the target list does not exist', async () => {
      const { a, cookie } = await boardWithCards();
      const res = await request(app)
        .patch(`/cards/${a.id}/move`)
        .set('Cookie', cookie)
        .send({ listId: new Types.ObjectId().toString() });
      expect(res.status).toBe(409);
    });
  });

  it('refuses to move an archived card', async () => {
    const { todo, done, cookie } = await boardWithCards();
    const archived = await createCard(todo, { archived: true });
    const res = await request(app)
      .patch(`/cards/${archived.id}/move`)
      .set('Cookie', cookie)
      .send({ listId: done.id });
    expect(res.status).toBe(400);
  });

  it('rejects a card as its own neighbour', async () => {
    const { todo, a, cookie } = await boardWithCards();
    const res = await request(app)
      .patch(`/cards/${a.id}/move`)
      .set('Cookie', cookie)
      .send({ listId: todo.id, beforeId: a.id });
    expect(res.status).toBe(400);
  });

  it('forbids a viewer', async () => {
    const { done, a, viewer } = await boardWithCards();
    const res = await request(app)
      .patch(`/cards/${a.id}/move`)
      .set('Cookie', await accessCookieFor(viewer))
      .send({ listId: done.id });

    expect(res.status).toBe(403);
    expect(await cardOrder(done._id)).toEqual([]);
  });
});

describe('DELETE /cards/:cardId', () => {
  it('deletes only that card and logs it', async () => {
    const { todo, a, b, c, cookie } = await boardWithCards();
    const res = await request(app).delete(`/cards/${b.id}`).set('Cookie', cookie);

    expect(res.status).toBe(204);
    expect(await cardOrder(todo._id)).toEqual([a.id, c.id]);
    expect(await ActivityModel.findOne({ cardId: b._id }).lean()).toMatchObject({
      type: 'card.deleted',
      meta: { listId: todo.id, title: 'B' },
    });
  });

  it('forbids a viewer', async () => {
    const { a, viewer } = await boardWithCards();
    const res = await request(app)
      .delete(`/cards/${a.id}`)
      .set('Cookie', await accessCookieFor(viewer));

    expect(res.status).toBe(403);
    expect(await CardModel.exists({ _id: a._id })).not.toBeNull();
  });
});
