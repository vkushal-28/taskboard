import { listDtoSchema } from '@taskboard/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Types } from 'mongoose';
import { z } from 'zod';
import {
  accessCookieFor,
  createBoard,
  createBoardWithRoles,
  createCard,
  createList,
  createUser,
  errorOf,
  parseBody,
} from '../../../test/factories.js';
import { createApp } from '../../app.js';
import { ActivityModel } from '../activity/model.js';
import { BY_POSITION } from '../boards/service.js';
import { CardModel } from '../cards/model.js';
import { ListModel } from './model.js';

const listBodySchema = z.object({ list: listDtoSchema });

let app: ReturnType<typeof createApp>;
beforeEach(() => {
  app = createApp();
});

async function listOrder(boardId: Types.ObjectId): Promise<string[]> {
  const lists = await ListModel.find({ boardId }).sort(BY_POSITION).lean();
  return lists.map((list) => list._id.toString());
}

/** A board with lists A, B, C in that order, and a member to act as. */
async function boardWithThreeLists() {
  const setup = await createBoardWithRoles();
  const [a, b, c] = await Promise.all(
    ['a0', 'a1', 'a2'].map((position) => createList(setup.board._id, position)),
  );
  if (!a || !b || !c) throw new Error('failed to create lists');
  return { ...setup, a, b, c, cookie: await accessCookieFor(setup.member) };
}

describe('POST /boards/:boardId/lists', () => {
  it('appends the list after the last one and logs it', async () => {
    const { board, member, c } = await boardWithThreeLists();
    const res = await request(app)
      .post(`/boards/${board.id}/lists`)
      .set('Cookie', await accessCookieFor(member))
      .send({ title: 'Review' });

    expect(res.status).toBe(201);
    const { list } = parseBody(listBodySchema, res);
    expect(list).toMatchObject({ boardId: board.id, title: 'Review' });
    expect(list.position > c.position).toBe(true);
    expect(await ActivityModel.findOne({ boardId: board._id }).lean()).toMatchObject({
      type: 'list.created',
      meta: { listId: list.id, title: 'Review' },
    });
  });

  it('forbids a viewer', async () => {
    const { board, viewer } = await createBoardWithRoles();
    const res = await request(app)
      .post(`/boards/${board.id}/lists`)
      .set('Cookie', await accessCookieFor(viewer))
      .send({ title: 'Nope' });

    expect(res.status).toBe(403);
    expect(await ListModel.countDocuments()).toBe(0);
  });

  it('rejects an empty title', async () => {
    const { board, member } = await createBoardWithRoles();
    const res = await request(app)
      .post(`/boards/${board.id}/lists`)
      .set('Cookie', await accessCookieFor(member))
      .send({ title: '   ' });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /lists/:listId', () => {
  it('renames the list', async () => {
    const { a, cookie } = await boardWithThreeLists();
    const res = await request(app)
      .patch(`/lists/${a.id}`)
      .set('Cookie', cookie)
      .send({ title: 'Backlog' });

    expect(res.status).toBe(200);
    expect(parseBody(listBodySchema, res).list).toMatchObject({ id: a.id, title: 'Backlog' });
  });
});

describe('PATCH /lists/:listId/move', () => {
  it('moves a list to the front', async () => {
    const { board, a, b, c, cookie } = await boardWithThreeLists();
    const res = await request(app)
      .patch(`/lists/${c.id}/move`)
      .set('Cookie', cookie)
      .send({ afterId: a.id });

    expect(res.status).toBe(200);
    expect(await listOrder(board._id)).toEqual([c.id, a.id, b.id]);
    expect(await ActivityModel.findOne({ boardId: board._id }).lean()).toMatchObject({
      type: 'list.moved',
    });
  });

  it('moves a list between two others', async () => {
    const { board, a, b, c, cookie } = await boardWithThreeLists();
    const res = await request(app)
      .patch(`/lists/${a.id}/move`)
      .set('Cookie', cookie)
      .send({ beforeId: b.id, afterId: c.id });

    expect(res.status).toBe(200);
    expect(await listOrder(board._id)).toEqual([b.id, a.id, c.id]);
  });

  it('moves a list to the end', async () => {
    const { board, a, b, c, cookie } = await boardWithThreeLists();
    const res = await request(app)
      .patch(`/lists/${a.id}/move`)
      .set('Cookie', cookie)
      .send({ beforeId: c.id });

    expect(res.status).toBe(200);
    expect(await listOrder(board._id)).toEqual([b.id, c.id, a.id]);
  });

  it('updates only the moved list', async () => {
    const { a, b, c, cookie } = await boardWithThreeLists();
    await request(app).patch(`/lists/${a.id}/move`).set('Cookie', cookie).send({ beforeId: c.id });

    const untouched = await ListModel.find({ _id: { $in: [b._id, c._id] } })
      .sort(BY_POSITION)
      .lean();
    expect(untouched.map((list) => list.position)).toEqual([b.position, c.position]);
  });

  it('returns 409 when the neighbours are in the wrong order', async () => {
    const { board, a, b, c, cookie } = await boardWithThreeLists();
    const res = await request(app)
      .patch(`/lists/${b.id}/move`)
      .set('Cookie', cookie)
      .send({ beforeId: c.id, afterId: a.id });

    expect(res.status).toBe(409);
    expect(errorOf(res).code).toBe('CONFLICT');
    expect(await listOrder(board._id)).toEqual([a.id, b.id, c.id]);
  });

  it('returns 409 when the neighbour is on another board', async () => {
    const { board, owner, a, b, c, cookie } = await boardWithThreeLists();
    const foreign = await createList((await createBoard(owner))._id);
    const res = await request(app)
      .patch(`/lists/${a.id}/move`)
      .set('Cookie', cookie)
      .send({ beforeId: foreign.id });

    expect(res.status).toBe(409);
    expect(await listOrder(board._id)).toEqual([a.id, b.id, c.id]);
  });

  it('returns 409 when another list sits between the neighbours', async () => {
    const { board, a, b, c, cookie } = await boardWithThreeLists();
    const d = await createList(board._id, 'a3');
    // The client thinks a and c are adjacent, but b is in between: its view is stale.
    const res = await request(app)
      .patch(`/lists/${d.id}/move`)
      .set('Cookie', cookie)
      .send({ beforeId: a.id, afterId: c.id });

    expect(res.status).toBe(409);
    expect(await listOrder(board._id)).toEqual([a.id, b.id, c.id, d.id]);
  });

  it.each<[object, string]>([
    [{}, 'no neighbours'],
    [{ beforeId: 'not-an-id' }, 'a malformed id'],
  ])('rejects %j (%s)', async (body) => {
    const { a, cookie } = await boardWithThreeLists();
    const res = await request(app).patch(`/lists/${a.id}/move`).set('Cookie', cookie).send(body);
    expect(res.status).toBe(400);
  });

  it('rejects a list as its own neighbour', async () => {
    const { a, cookie } = await boardWithThreeLists();
    const res = await request(app)
      .patch(`/lists/${a.id}/move`)
      .set('Cookie', cookie)
      .send({ beforeId: a.id });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /lists/:listId', () => {
  it('deletes the list and its cards only', async () => {
    const { board, a, b, cookie } = await boardWithThreeLists();
    await createCard(a);
    const kept = await createCard(b);

    const res = await request(app).delete(`/lists/${a.id}`).set('Cookie', cookie);

    expect(res.status).toBe(204);
    expect(await ListModel.exists({ _id: a._id })).toBeNull();
    expect(
      (await CardModel.find({ boardId: board._id }).lean()).map((card) => card._id.toString()),
    ).toEqual([kept.id]);
    expect(await ActivityModel.findOne({ boardId: board._id }).lean()).toMatchObject({
      type: 'list.deleted',
      meta: { listId: a.id },
    });
  });

  it('returns 404 to a non-member', async () => {
    const outsider = await createUser();
    const { a } = await boardWithThreeLists();
    const res = await request(app)
      .delete(`/lists/${a.id}`)
      .set('Cookie', await accessCookieFor(outsider));

    expect(res.status).toBe(404);
    expect(await ListModel.exists({ _id: a._id })).not.toBeNull();
  });
});
