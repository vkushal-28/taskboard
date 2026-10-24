import { ROLES, type Role } from '@taskboard/shared';
import cookieParser from 'cookie-parser';
import express from 'express';
import { Types } from 'mongoose';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  accessCookieFor,
  createBoard,
  createBoardWithRoles,
  createCard,
  createList,
  createUser,
  errorOf,
} from '../../test/factories.js';
import { errorHandler } from './error-handler.js';
import { requireAuth } from './require-auth.js';
import { requireBoardRole } from './require-board-role.js';

// One route per min role and param shape; each echoes what the middleware put on req.
function createTestApp() {
  const app = express();
  app.use(cookieParser());
  const echo: express.RequestHandler = (req, res) => {
    res.json({ boardId: req.boardId, role: req.boardRole });
  };
  for (const minRole of ROLES) {
    app.get(`/${minRole}/boards/:boardId`, requireAuth, requireBoardRole(minRole), echo);
  }
  app.get('/viewer/lists/:listId', requireAuth, requireBoardRole('viewer'), echo);
  app.get('/viewer/cards/:cardId', requireAuth, requireBoardRole('viewer'), echo);
  app.get('/viewer/boards/:boardId/cards/:cardId', requireAuth, requireBoardRole('viewer'), echo);
  app.get('/viewer/no-params', requireAuth, requireBoardRole('viewer'), echo);
  app.use(errorHandler);
  return app;
}

const app = createTestApp();

describe('requireBoardRole', () => {
  const matrix: [actual: Role, minRole: Role, status: number][] = [
    ['owner', 'owner', 200],
    ['owner', 'member', 200],
    ['owner', 'viewer', 200],
    ['member', 'owner', 403],
    ['member', 'member', 200],
    ['member', 'viewer', 200],
    ['viewer', 'owner', 403],
    ['viewer', 'member', 403],
    ['viewer', 'viewer', 200],
  ];

  it.each(matrix)('%s on a route needing %s gets %i', async (actual, minRole, status) => {
    const setup = await createBoardWithRoles();
    const res = await request(app)
      .get(`/${minRole}/boards/${setup.board.id}`)
      .set('Cookie', await accessCookieFor(setup[actual]));

    expect(res.status).toBe(status);
    if (status === 200) {
      expect(res.body).toEqual({ boardId: setup.board.id, role: actual });
    } else {
      expect(errorOf(res).code).toBe('FORBIDDEN');
    }
  });

  it('returns 404 to a non-member so the board id does not leak', async () => {
    const { board, outsider } = await createBoardWithRoles();
    const res = await request(app)
      .get(`/viewer/boards/${board.id}`)
      .set('Cookie', await accessCookieFor(outsider));

    expect(res.status).toBe(404);
    expect(errorOf(res).code).toBe('NOT_FOUND');
  });

  it('returns 401 without an access cookie', async () => {
    const { board } = await createBoardWithRoles();
    const res = await request(app).get(`/viewer/boards/${board.id}`);
    expect(res.status).toBe(401);
  });

  it.each(['not-an-id', new Types.ObjectId().toString()])(
    'returns 404 for an unknown or malformed board id (%s)',
    async (boardId) => {
      const user = await createUser();
      const res = await request(app)
        .get(`/viewer/boards/${boardId}`)
        .set('Cookie', await accessCookieFor(user));
      expect(res.status).toBe(404);
    },
  );

  it('resolves the board from a list id', async () => {
    const { board, member } = await createBoardWithRoles();
    const list = await createList(board._id);
    const res = await request(app)
      .get(`/viewer/lists/${list.id}`)
      .set('Cookie', await accessCookieFor(member));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ boardId: board.id, role: 'member' });
  });

  it('resolves the board from a card id', async () => {
    const { board, viewer } = await createBoardWithRoles();
    const card = await createCard(await createList(board._id));
    const res = await request(app)
      .get(`/viewer/cards/${card.id}`)
      .set('Cookie', await accessCookieFor(viewer));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ boardId: board.id, role: 'viewer' });
  });

  it('returns 404 to a non-member reaching a card by id', async () => {
    const { board, outsider } = await createBoardWithRoles();
    const card = await createCard(await createList(board._id));
    const res = await request(app)
      .get(`/viewer/cards/${card.id}`)
      .set('Cookie', await accessCookieFor(outsider));
    expect(res.status).toBe(404);
  });

  it.each(['lists', 'cards'])('returns 404 for an unknown %s id', async (kind) => {
    const user = await createUser();
    const res = await request(app)
      .get(`/viewer/${kind}/${new Types.ObjectId().toString()}`)
      .set('Cookie', await accessCookieFor(user));
    expect(res.status).toBe(404);
  });

  it("returns 404 when the board in the url is not the card's board", async () => {
    const { board: boardA, member } = await createBoardWithRoles();
    const boardB = await createBoard(await createUser());
    const cardOnB = await createCard(await createList(boardB._id));

    const res = await request(app)
      .get(`/viewer/boards/${boardA.id}/cards/${cardOnB.id}`)
      .set('Cookie', await accessCookieFor(member));
    expect(res.status).toBe(404);
  });

  it('fails loudly when mounted on a route without a board, list or card param', async () => {
    const user = await createUser();
    const res = await request(app)
      .get('/viewer/no-params')
      .set('Cookie', await accessCookieFor(user));
    expect(res.status).toBe(500);
  });
});
