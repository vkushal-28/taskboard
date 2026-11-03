import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { BoardModel } from '../boards/model.js';
import { CardModel } from '../cards/model.js';
import { UserModel } from '../users/model.js';
import { DEMO_BOARD_TITLE, DEMO_PASSWORD, DEMO_USERS, seedDemo } from './seed.js';

function login(email: string) {
  return request(createApp()).post('/auth/login').send({ email, password: DEMO_PASSWORD });
}

describe('seedDemo', () => {
  it('creates accounts that can sign in with the demo password', async () => {
    await seedDemo();

    await login(DEMO_USERS.priya.email).expect(200);
    await login(DEMO_USERS.alex.email).expect(200);
  });

  it('creates the demo board with Priya as owner and Alex as member', async () => {
    const { boardId, userIds } = await seedDemo();

    const board = await BoardModel.findById(boardId).lean();
    expect(board?.title).toBe(DEMO_BOARD_TITLE);
    expect(board?.members.map((m) => [m.userId.toString(), m.role])).toEqual([
      [userIds.priya, 'owner'],
      [userIds.alex, 'member'],
    ]);
    expect(await CardModel.countDocuments({ boardId })).toBeGreaterThan(0);
  });

  it('can run again without duplicating, and restores the demo password', async () => {
    const first = await seedDemo();
    await UserModel.updateOne({ email: DEMO_USERS.priya.email }, { passwordHash: 'changed' });
    const cards = await CardModel.countDocuments({ boardId: first.boardId });

    const second = await seedDemo();

    expect(second).toMatchObject({ boardId: first.boardId, boardCreated: false });
    expect(await UserModel.countDocuments()).toBe(2);
    expect(await BoardModel.countDocuments()).toBe(1);
    expect(await CardModel.countDocuments({ boardId: first.boardId })).toBe(cards);
    await login(DEMO_USERS.priya.email).expect(200);
  });
});
