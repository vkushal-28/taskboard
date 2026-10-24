import {
  boardDetailSchema,
  boardMemberDtoSchema,
  boardSummarySchema,
  DEFAULT_BOARD_COLOR,
} from '@taskboard/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
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
import { CardModel } from '../cards/model.js';
import { ListModel } from '../lists/model.js';
import { BoardModel } from './model.js';

const boardsBodySchema = z.object({ boards: z.array(boardSummarySchema) });
const boardBodySchema = z.object({ board: boardSummarySchema });
// .strict() fails the parse on any extra member field, such as an email.
const strictMembersSchema = z.object({
  board: z.object({ members: z.array(boardMemberDtoSchema.strict()) }),
});

let app: ReturnType<typeof createApp>;
beforeEach(() => {
  app = createApp();
});

describe('GET /boards', () => {
  it('lists boards the user belongs to with their role, newest first', async () => {
    const { board: shared, viewer } = await createBoardWithRoles();
    const owned = await createBoard(viewer);
    await createBoard(await createUser()); // someone else's board

    const res = await request(app)
      .get('/boards')
      .set('Cookie', await accessCookieFor(viewer));

    expect(res.status).toBe(200);
    const { boards } = parseBody(boardsBodySchema, res);
    expect(boards.map(({ id, role }) => ({ id, role }))).toEqual([
      { id: owned.id, role: 'owner' },
      { id: shared.id, role: 'viewer' },
    ]);
  });

  it('requires a signed-in user', async () => {
    const res = await request(app).get('/boards');
    expect(res.status).toBe(401);
  });
});

describe('POST /boards', () => {
  it('makes the creator owner and seeds three ordered lists', async () => {
    const user = await createUser();
    const res = await request(app)
      .post('/boards')
      .set('Cookie', await accessCookieFor(user))
      .send({ title: '  Website Redesign  ' });

    expect(res.status).toBe(201);
    const { board, lists, cards } = parseBody(boardDetailSchema, res);
    expect(board).toMatchObject({
      title: 'Website Redesign',
      color: DEFAULT_BOARD_COLOR,
      myRole: 'owner',
    });
    expect(board.members).toEqual([{ id: user.id, name: user.name, role: 'owner' }]);
    expect(lists.map((list) => list.title)).toEqual(['To Do', 'In Progress', 'Done']);
    expect([...lists].sort((a, b) => (a.position < b.position ? -1 : 1))).toEqual(lists);
    expect(cards).toEqual([]);

    const activity = await ActivityModel.find({ boardId: board.id }).lean();
    expect(activity.map((entry) => entry.type)).toEqual(['board.created']);
  });

  it.each<[object, string]>([
    [{ title: '' }, 'an empty title'],
    [{ title: 'Ok', color: 'red' }, 'a non-hex color'],
    [{}, 'a missing title'],
  ])('rejects %j (%s)', async (body) => {
    const res = await request(app)
      .post('/boards')
      .set('Cookie', await accessCookieFor(await createUser()))
      .send(body);

    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe('VALIDATION_ERROR');
    expect(await BoardModel.countDocuments()).toBe(0);
  });
});

describe('GET /boards/:boardId', () => {
  it('returns the board with sorted lists and cards, without archived cards', async () => {
    const { board, owner, member, viewer } = await createBoardWithRoles();
    const second = await createList(board._id, 'a1');
    const first = await createList(board._id, 'a0');
    const later = await createCard(first, 'a1');
    const earlier = await createCard(first, 'a0');
    await CardModel.create({
      boardId: board._id,
      listId: second._id,
      title: 'Old',
      position: 'a0',
      archived: true,
    });

    const res = await request(app)
      .get(`/boards/${board.id}`)
      .set('Cookie', await accessCookieFor(viewer));

    expect(res.status).toBe(200);
    const detail = parseBody(boardDetailSchema, res);
    expect(detail.board.myRole).toBe('viewer');
    // Members expose id, name and role only: no email for other members to harvest.
    expect(parseBody(strictMembersSchema, res).board.members).toEqual([
      { id: owner.id, name: owner.name, role: 'owner' },
      { id: member.id, name: member.name, role: 'member' },
      { id: viewer.id, name: viewer.name, role: 'viewer' },
    ]);
    expect(detail.lists.map((list) => list.id)).toEqual([first.id, second.id]);
    expect(detail.cards.map((card) => card.id)).toEqual([earlier.id, later.id]);
  });
});

describe('PATCH /boards/:boardId', () => {
  it('lets the owner rename and recolor the board', async () => {
    const { board, owner } = await createBoardWithRoles();
    const res = await request(app)
      .patch(`/boards/${board.id}`)
      .set('Cookie', await accessCookieFor(owner))
      .send({ title: 'Renamed', color: '#16a34a' });

    expect(res.status).toBe(200);
    expect(parseBody(boardBodySchema, res).board).toMatchObject({
      id: board.id,
      title: 'Renamed',
      color: '#16a34a',
      role: 'owner',
    });
    const activity = await ActivityModel.findOne({ boardId: board._id }).lean();
    expect(activity).toMatchObject({ type: 'board.updated', meta: { fields: ['title', 'color'] } });
  });

  it('forbids a member', async () => {
    const { board, member } = await createBoardWithRoles();
    const res = await request(app)
      .patch(`/boards/${board.id}`)
      .set('Cookie', await accessCookieFor(member))
      .send({ title: 'Nope' });

    expect(res.status).toBe(403);
    expect((await BoardModel.findById(board._id).lean())?.title).toBe('Test Board');
  });

  it('rejects an empty update', async () => {
    const { board, owner } = await createBoardWithRoles();
    const res = await request(app)
      .patch(`/boards/${board.id}`)
      .set('Cookie', await accessCookieFor(owner))
      .send({});
    expect(res.status).toBe(400);
  });
});

describe('DELETE /boards/:boardId', () => {
  it('deletes the board with its lists, cards and activity, and nothing else', async () => {
    const { board, owner } = await createBoardWithRoles();
    await createCard(await createList(board._id));
    await ActivityModel.create({ boardId: board._id, actorId: owner._id, type: 'board.created' });
    const otherBoard = await createBoard(owner);
    await createCard(await createList(otherBoard._id));

    const res = await request(app)
      .delete(`/boards/${board.id}`)
      .set('Cookie', await accessCookieFor(owner));

    expect(res.status).toBe(204);
    expect(await BoardModel.exists({ _id: board._id })).toBeNull();
    expect(await ListModel.countDocuments({ boardId: board._id })).toBe(0);
    expect(await CardModel.countDocuments({ boardId: board._id })).toBe(0);
    expect(await ActivityModel.countDocuments({ boardId: board._id })).toBe(0);
    expect(await CardModel.countDocuments({ boardId: otherBoard._id })).toBe(1);
  });

  it('forbids a member', async () => {
    const { board, member } = await createBoardWithRoles();
    const res = await request(app)
      .delete(`/boards/${board.id}`)
      .set('Cookie', await accessCookieFor(member));

    expect(res.status).toBe(403);
    expect(await BoardModel.exists({ _id: board._id })).not.toBeNull();
  });
});
