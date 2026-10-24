import { readFile } from 'node:fs/promises';
import { hasRole, type Role } from '@taskboard/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  accessCookieFor,
  createBoardWithRoles,
  createCard,
  createList,
  errorOf,
} from '../test/factories.js';
import { createApp } from './app.js';
import { ActivityModel } from './modules/activity/model.js';

// Walks docs/permissions.md: every board-scoped endpoint, called by every kind of user.

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';
type Actor = Role | 'outsider' | 'anonymous';
type Fixture = Awaited<ReturnType<typeof createFixture>>;

interface Endpoint {
  /** Exactly as written in docs/permissions.md. */
  route: `${Method} /${string}`;
  minRole: Role;
  successStatus: number;
  request: (fixture: Fixture) => { path: string; body?: object };
}

const ENDPOINTS: Endpoint[] = [
  {
    route: 'GET /boards/:boardId',
    minRole: 'viewer',
    successStatus: 200,
    request: ({ board }) => ({ path: `/boards/${board.id}` }),
  },
  {
    route: 'PATCH /boards/:boardId',
    minRole: 'owner',
    successStatus: 200,
    request: ({ board }) => ({ path: `/boards/${board.id}`, body: { title: 'Renamed' } }),
  },
  {
    route: 'DELETE /boards/:boardId',
    minRole: 'owner',
    successStatus: 204,
    request: ({ board }) => ({ path: `/boards/${board.id}` }),
  },
  {
    route: 'POST /boards/:boardId/lists',
    minRole: 'member',
    successStatus: 201,
    request: ({ board }) => ({ path: `/boards/${board.id}/lists`, body: { title: 'New' } }),
  },
  {
    route: 'PATCH /lists/:listId',
    minRole: 'member',
    successStatus: 200,
    request: ({ list }) => ({ path: `/lists/${list.id}`, body: { title: 'Renamed' } }),
  },
  {
    route: 'PATCH /lists/:listId/move',
    minRole: 'member',
    successStatus: 200,
    request: ({ list, otherList }) => ({
      path: `/lists/${list.id}/move`,
      body: { beforeId: otherList.id },
    }),
  },
  {
    route: 'DELETE /lists/:listId',
    minRole: 'member',
    successStatus: 204,
    request: ({ list }) => ({ path: `/lists/${list.id}` }),
  },
  {
    route: 'POST /lists/:listId/cards',
    minRole: 'member',
    successStatus: 201,
    request: ({ list }) => ({ path: `/lists/${list.id}/cards`, body: { title: 'New' } }),
  },
  {
    route: 'GET /cards/:cardId',
    minRole: 'viewer',
    successStatus: 200,
    request: ({ card }) => ({ path: `/cards/${card.id}` }),
  },
  {
    route: 'PATCH /cards/:cardId',
    minRole: 'member',
    successStatus: 200,
    request: ({ card }) => ({ path: `/cards/${card.id}`, body: { title: 'Renamed' } }),
  },
  {
    route: 'PATCH /cards/:cardId/move',
    minRole: 'member',
    successStatus: 200,
    request: ({ card, otherList }) => ({
      path: `/cards/${card.id}/move`,
      body: { listId: otherList.id },
    }),
  },
  {
    route: 'DELETE /cards/:cardId',
    minRole: 'member',
    successStatus: 204,
    request: ({ card }) => ({ path: `/cards/${card.id}` }),
  },
];

/** Routes that only need a signed-in user, not a board role. */
const ACCOUNT_ENDPOINTS: { route: `${Method} /${string}`; successStatus: number; body?: object }[] =
  [
    { route: 'GET /boards', successStatus: 200 },
    { route: 'POST /boards', successStatus: 201, body: { title: 'Mine' } },
  ];

const ACTORS: Actor[] = ['owner', 'member', 'viewer', 'outsider', 'anonymous'];

async function createFixture() {
  const roles = await createBoardWithRoles();
  const list = await createList(roles.board._id);
  const otherList = await createList(roles.board._id);
  const card = await createCard(list);
  return { ...roles, list, otherList, card };
}

async function cookieFor(fixture: Fixture, actor: Actor): Promise<string | undefined> {
  return actor === 'anonymous' ? undefined : accessCookieFor(fixture[actor]);
}

function send(route: string, path: string, cookie: string | undefined, body?: object) {
  const agent = request(createApp());
  const method = route.split(' ')[0];
  const req =
    method === 'GET'
      ? agent.get(path)
      : method === 'POST'
        ? agent.post(path)
        : method === 'PATCH'
          ? agent.patch(path)
          : agent.delete(path);
  if (cookie) void req.set('Cookie', cookie);
  return body ? req.send(body) : req;
}

function expectedStatus(endpoint: Endpoint, actor: Actor): number {
  if (actor === 'anonymous') return 401;
  if (actor === 'outsider') return 404;
  return hasRole(actor, endpoint.minRole) ? endpoint.successStatus : 403;
}

const ERROR_CODES: Record<number, string> = {
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
};

describe.each(ENDPOINTS)('$route (min role $minRole)', (endpoint) => {
  it.each(ACTORS)('%s', async (actor) => {
    const fixture = await createFixture();
    const { path, body } = endpoint.request(fixture);
    const status = expectedStatus(endpoint, actor);

    const res = await send(endpoint.route, path, await cookieFor(fixture, actor), body);

    expect(res.status).toBe(status);
    const code = ERROR_CODES[status];
    if (code) {
      expect(errorOf(res).code).toBe(code);
      // Every successful write logs activity, so an empty log proves nothing was written.
      expect(await ActivityModel.countDocuments()).toBe(0);
    }
  });
});

describe.each(ACCOUNT_ENDPOINTS)('$route (signed in)', (endpoint) => {
  it.each(ACTORS)('%s', async (actor) => {
    const fixture = await createFixture();
    const path = endpoint.route.split(' ')[1] ?? '';

    const res = await send(endpoint.route, path, await cookieFor(fixture, actor), endpoint.body);

    expect(res.status).toBe(actor === 'anonymous' ? 401 : endpoint.successStatus);
  });
});

describe('docs/permissions.md', () => {
  it('matches the matrix tested here', async () => {
    const doc = await readFile(new URL('../../../docs/permissions.md', import.meta.url), 'utf8');
    const rows = [...doc.matchAll(/^\| `([^`]+)` *\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|$/gm)].map(
      (match) => match.slice(1).map((cell) => cell.trim()),
    );

    const cell = (allowed: boolean) => (allowed ? '✓' : '403');
    const expected = [
      ...ACCOUNT_ENDPOINTS.map(({ route }) => [route, 'signed in', '✓', '✓', '✓']),
      ...ENDPOINTS.map(({ route, minRole }) => [
        route,
        minRole,
        cell(hasRole('owner', minRole)),
        cell(hasRole('member', minRole)),
        cell(hasRole('viewer', minRole)),
      ]),
    ];
    expect(rows.sort()).toEqual(expected.sort());
  });
});
