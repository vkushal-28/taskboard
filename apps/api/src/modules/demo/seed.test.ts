import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { BoardModel } from '../boards/model.js';
import { CardModel } from '../cards/model.js';
import { CommentModel } from '../comments/model.js';
import { ListModel } from '../lists/model.js';
import { UserModel } from '../users/model.js';
import { DEMO_BOARDS, DEMO_PASSWORD, DEMO_USERS, seedDemo } from './seed.js';

function login(email: string) {
  return request(createApp()).post('/auth/login').send({ email, password: DEMO_PASSWORD });
}

describe('seedDemo', () => {
  it('creates accounts that can sign in with the demo password', async () => {
    await seedDemo();

    await login(DEMO_USERS.priya.email).expect(200);
    await login(DEMO_USERS.alex.email).expect(200);
  });

  it('creates every demo board with Priya as owner and Alex as member', async () => {
    const { boards, userIds } = await seedDemo();

    expect(boards.map((board) => [board.title, board.created])).toEqual(
      DEMO_BOARDS.map((spec) => [spec.title, true]),
    );
    for (const { id } of boards) {
      const board = await BoardModel.findById(id).lean();
      expect(board?.members.map((m) => [m.userId.toString(), m.role])).toEqual([
        [userIds.priya, 'owner'],
        [userIds.alex, 'member'],
      ]);
    }
  });

  it('fills the lists, cards and card details the spec describes', async () => {
    const { boards, userIds } = await seedDemo();
    const launch = boards.find((board) => board.title === 'Mobile App Launch');
    if (!launch) throw new Error('Mobile App Launch was not seeded');

    const lists = await ListModel.find({ boardId: launch.id }).sort({ position: 1 }).lean();
    expect(lists.map((list) => list.title)).toEqual([
      'To Do',
      'In Progress',
      'Done',
      'QA / Review',
    ]);
    const push = await CardModel.findOne({
      boardId: launch.id,
      title: 'Push notifications',
    }).lean();
    expect(push).toMatchObject({
      listId: lists[1]?._id,
      labels: [
        { name: 'Mobile', color: '#2563eb' },
        { name: 'High priority', color: '#dc2626' },
      ],
      commentCount: 1,
    });
    expect(push?.assignees.map(String)).toEqual([userIds.priya]);
    expect(push?.checklist.map((item) => item.done)).toEqual([true, true, false, false]);
    expect(push?.dueDate?.getTime()).toBeGreaterThan(Date.now());
    expect(await CommentModel.countDocuments({ boardId: launch.id })).toBe(2);
  });

  it('can run again without duplicating, and restores the demo password', async () => {
    const first = await seedDemo();
    await UserModel.updateOne({ email: DEMO_USERS.priya.email }, { passwordHash: 'changed' });
    const cards = await CardModel.countDocuments();

    const second = await seedDemo();

    expect(second.boards).toEqual(first.boards.map((board) => ({ ...board, created: false })));
    expect(await UserModel.countDocuments()).toBe(2);
    expect(await BoardModel.countDocuments()).toBe(DEMO_BOARDS.length);
    expect(await CardModel.countDocuments()).toBe(cards);
    await login(DEMO_USERS.priya.email).expect(200);
  });

  it('adds a demo board that is missing without touching the existing one', async () => {
    const first = await seedDemo();
    const [kept, removed] = first.boards;
    if (!kept || !removed) throw new Error('expected two demo boards');
    await BoardModel.deleteOne({ _id: removed.id });

    const second = await seedDemo();

    expect(second.boards[0]).toEqual({ ...kept, created: false });
    expect(second.boards[1]).toMatchObject({ title: removed.title, created: true });
  });
});
