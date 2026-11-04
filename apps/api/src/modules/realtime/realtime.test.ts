import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  BOARD_JOIN,
  CARD_DRAG,
  CARD_DRAGGING,
  cardDraggingSchema,
  PRESENCE_UPDATE,
  presenceUpdateSchema,
  boardEventSchemas,
  type BoardEventName,
  type BoardJoinAck,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@taskboard/shared';
import { io as connect, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  accessCookieFor,
  createBoardWithRoles,
  createCard,
  createList,
  createUser,
} from '../../../test/factories.js';
import { createApp } from '../../app.js';
import { emitToBoard, setRealtimeServer, type RealtimeServer } from './emitter.js';
import { createRealtimeServer } from './server.js';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const CLIENT_ORIGIN = 'http://localhost:5173';
const EVENT_TIMEOUT_MS = 2_000;

const app = createApp();
let httpServer: HttpServer;
let io: RealtimeServer;
let url: string;
const openSockets: ClientSocket[] = [];

beforeAll(async () => {
  httpServer = createServer(app);
  io = createRealtimeServer(httpServer);
  setRealtimeServer(io);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  url = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
});

afterEach(() => {
  openSockets.splice(0).forEach((socket) => socket.disconnect());
});

afterAll(async () => {
  setRealtimeServer(null);
  await io.close();
});

function open(headers: Record<string, string>): ClientSocket {
  const socket: ClientSocket = connect(url, {
    transports: ['websocket'],
    reconnection: false,
    extraHeaders: headers,
  });
  openSockets.push(socket);
  return socket;
}

/** Resolves once connected, or with the `connect_error` code. */
function connectResult(socket: ClientSocket): Promise<{ connected: true } | { code: string }> {
  return new Promise((resolve) => {
    socket.once('connect', () => resolve({ connected: true }));
    socket.once('connect_error', (err) => {
      const data: unknown = (err as Error & { data?: unknown }).data;
      const code =
        typeof data === 'object' && data !== null && 'code' in data
          ? String(data.code)
          : err.message;
      resolve({ code });
    });
  });
}

async function connectedAs(user: Parameters<typeof accessCookieFor>[0]): Promise<ClientSocket> {
  const socket = open({ cookie: await accessCookieFor(user), origin: CLIENT_ORIGIN });
  expect(await connectResult(socket)).toEqual({ connected: true });
  return socket;
}

function join(socket: ClientSocket, boardId: unknown): Promise<BoardJoinAck> {
  // The payload type is the happy path; tests also send malformed ones on purpose.
  return socket.timeout(EVENT_TIMEOUT_MS).emitWithAck(BOARD_JOIN, boardId as { boardId: string });
}

function nextEvent<E extends BoardEventName>(socket: ClientSocket, event: E): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ${event} event`)), EVENT_TIMEOUT_MS);
    // Listening through the untyped `onAny` keeps this helper generic over every event.
    socket.onAny((name: string, payload: unknown) => {
      if (name !== event) return;
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

describe('socket handshake', () => {
  it('rejects a connection without an access cookie', async () => {
    const socket = open({ origin: CLIENT_ORIGIN });
    expect(await connectResult(socket)).toEqual({ code: 'UNAUTHORIZED' });
  });

  it('rejects an invalid access token', async () => {
    const socket = open({ cookie: 'tb_access=not-a-jwt', origin: CLIENT_ORIGIN });
    expect(await connectResult(socket)).toEqual({ code: 'UNAUTHORIZED' });
  });

  it('rejects a handshake from a foreign origin, even with a valid cookie', async () => {
    const user = await createUser();
    const socket = open({ cookie: await accessCookieFor(user), origin: 'https://evil.example' });
    const result = await connectResult(socket);
    expect(result).not.toEqual({ connected: true });
  });

  it('accepts a valid cookie from the web app origin', async () => {
    await connectedAs(await createUser());
  });
});

describe('board:join', () => {
  it.each(['owner', 'member', 'viewer'] as const)('lets a %s join the board room', async (role) => {
    const fixture = await createBoardWithRoles();
    const socket = await connectedAs(fixture[role]);
    expect(await join(socket, { boardId: fixture.board.id })).toEqual({ ok: true, role });
  });

  it('answers NOT_FOUND to a non-member, like a missing board', async () => {
    const { board, outsider } = await createBoardWithRoles();
    const socket = await connectedAs(outsider);
    const ack = await join(socket, { boardId: board.id });
    expect(ack).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('rejects a malformed board id', async () => {
    const socket = await connectedAs(await createUser());
    const ack = await join(socket, { boardId: 'nope' });
    expect(ack).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
  });
});

describe('board events', () => {
  it('sends a REST write to sockets in that board room only', async () => {
    const fixture = await createBoardWithRoles();
    const other = await createBoardWithRoles();
    const list = await createList(fixture.board._id);
    const target = await createList(fixture.board._id);
    const card = await createCard(list);

    const watcher = await connectedAs(fixture.viewer);
    await join(watcher, { boardId: fixture.board.id });
    const bystander = await connectedAs(other.owner);
    await join(bystander, { boardId: other.board.id });
    let bystanderEvents = 0;
    bystander.onAny(() => (bystanderEvents += 1));

    const received = nextEvent(watcher, 'card:moved');
    await request(app)
      .patch(`/cards/${card.id}/move`)
      .set('Cookie', await accessCookieFor(fixture.member))
      .send({ listId: target.id })
      .expect(200);

    const payload = boardEventSchemas['card:moved'].parse(await received);
    expect(payload).toMatchObject({
      boardId: fixture.board.id,
      actorId: fixture.member.id,
      fromListId: list.id,
      card: { id: card.id, listId: target.id },
    });
    expect(bystanderEvents).toBe(0);
  });

  it('stops sending events after board:leave', async () => {
    const fixture = await createBoardWithRoles();
    const socket = await connectedAs(fixture.member);
    await join(socket, { boardId: fixture.board.id });
    let events = 0;
    socket.onAny(() => (events += 1));

    socket.emit('board:leave', { boardId: fixture.board.id });
    // A join round trip after the leave guarantees the server has processed it.
    await join(socket, { boardId: 'not-an-id' });
    emitToBoard(fixture.board.id, 'board:deleted', {
      boardId: fixture.board.id,
      actorId: fixture.owner.id,
    });
    await join(socket, { boardId: 'not-an-id' });
    expect(events).toBe(0);
  });

  // One row per write: the REST call and the event it must broadcast, checked against the
  // shared payload schema so the client contract can't drift.
  const writes: {
    event: BoardEventName;
    send: (f: Awaited<ReturnType<typeof writeFixture>>) => request.Test;
  }[] = [
    {
      event: 'list:created',
      send: (f) => f.as('member').post(`/boards/${f.board.id}/lists`).send({ title: 'New' }),
    },
    {
      event: 'list:updated',
      send: (f) => f.as('member').patch(`/lists/${f.list.id}`).send({ title: 'Renamed' }),
    },
    {
      event: 'list:moved',
      send: (f) => f.as('member').patch(`/lists/${f.list.id}/move`).send({ afterId: f.target.id }),
    },
    { event: 'list:deleted', send: (f) => f.as('member').delete(`/lists/${f.list.id}`) },
    {
      event: 'card:created',
      send: (f) => f.as('member').post(`/lists/${f.list.id}/cards`).send({ title: 'New' }),
    },
    {
      event: 'card:updated',
      send: (f) => f.as('member').patch(`/cards/${f.card.id}`).send({ archived: true }),
    },
    {
      event: 'card:moved',
      send: (f) => f.as('member').patch(`/cards/${f.card.id}/move`).send({ listId: f.target.id }),
    },
    { event: 'card:deleted', send: (f) => f.as('member').delete(`/cards/${f.card.id}`) },
    {
      event: 'card:updated',
      send: (f) => f.as('member').post(`/cards/${f.card.id}/checklist`).send({ text: 'Live step' }),
    },
    {
      event: 'comment:created',
      send: (f) => f.as('member').post(`/cards/${f.card.id}/comments`).send({ body: 'Live' }),
    },
    {
      // A comment also changes the card's commentCount.
      event: 'card:updated',
      send: (f) => f.as('member').post(`/cards/${f.card.id}/comments`).send({ body: 'Counted' }),
    },
    {
      event: 'board:updated',
      send: (f) => f.as('owner').patch(`/boards/${f.board.id}`).send({ title: 'Renamed' }),
    },
    { event: 'board:deleted', send: (f) => f.as('owner').delete(`/boards/${f.board.id}`) },
  ];

  async function writeFixture() {
    const fixture = await createBoardWithRoles();
    const list = await createList(fixture.board._id);
    const target = await createList(fixture.board._id);
    const card = await createCard(list);
    const cookies = {
      owner: await accessCookieFor(fixture.owner),
      member: await accessCookieFor(fixture.member),
    };
    const as = (role: keyof typeof cookies) => ({
      post: (path: string) => request(app).post(path).set('Cookie', cookies[role]),
      patch: (path: string) => request(app).patch(path).set('Cookie', cookies[role]),
      delete: (path: string) => request(app).delete(path).set('Cookie', cookies[role]),
    });
    return { ...fixture, list, target, card, as };
  }

  it.each(writes)('broadcasts $event after the write', async ({ event, send }) => {
    const fixture = await writeFixture();
    const watcher = await connectedAs(fixture.viewer);
    await join(watcher, { boardId: fixture.board.id });

    const received = nextEvent(watcher, event);
    const res = await send(fixture);
    expect(res.status).toBeLessThan(300);

    const payload = boardEventSchemas[event].parse(await received);
    expect(payload).toMatchObject({ boardId: fixture.board.id });
    const actor = event.startsWith('board:') ? fixture.owner : fixture.member;
    expect(payload.actorId).toBe(actor.id);
  });

  it('does not broadcast a write that failed', async () => {
    const fixture = await writeFixture();
    const watcher = await connectedAs(fixture.owner);
    await join(watcher, { boardId: fixture.board.id });
    let events = 0;
    watcher.onAny(() => (events += 1));

    const viewerCookie = await accessCookieFor(fixture.viewer);
    await request(app)
      .patch(`/lists/${fixture.list.id}`)
      .set('Cookie', viewerCookie)
      .send({ title: 'Nope' })
      .expect(403);
    await join(watcher, { boardId: 'not-an-id' });
    expect(events).toBe(0);
  });

  it('empties the room when the board is deleted', async () => {
    const fixture = await writeFixture();
    const watcher = await connectedAs(fixture.member);
    await join(watcher, { boardId: fixture.board.id });

    await fixture.as('owner').delete(`/boards/${fixture.board.id}`).expect(204);
    const sockets = await io.in(`board:${fixture.board.id}`).fetchSockets();
    expect(sockets).toHaveLength(0);
  });
});

describe('emitToBoard', () => {
  it('does nothing when no realtime server is set', () => {
    setRealtimeServer(null);
    try {
      expect(() =>
        emitToBoard('64b000000000000000000000', 'board:deleted', {
          boardId: '64b000000000000000000000',
          actorId: '64b000000000000000000001',
        }),
      ).not.toThrow();
    } finally {
      setRealtimeServer(io);
    }
  });
});

/** The next `name` event whose payload passes `match`, or a rejection after the timeout. */
function nextSignal(
  socket: ClientSocket,
  name: string,
  match: (payload: unknown) => boolean = () => true,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no matching ${name}`)), EVENT_TIMEOUT_MS);
    const listener = (event: string, payload: unknown) => {
      if (event !== name || !match(payload)) return;
      clearTimeout(timer);
      socket.offAny(listener);
      resolve(payload);
    };
    socket.onAny(listener);
  });
}

const onlineIs =
  (...ids: string[]) =>
  (payload: unknown) => {
    const parsed = presenceUpdateSchema.safeParse(payload);
    return parsed.success && [...parsed.data.userIds].sort().join() === [...ids].sort().join();
  };

/** Resolves after the server has handled everything this socket sent before. */
async function roundTrip(socket: ClientSocket): Promise<void> {
  await join(socket, { boardId: 'not-an-id' });
}

describe('presence', () => {
  it('tells everyone in the room who is online, the joiner included', async () => {
    const { board, owner, member } = await createBoardWithRoles();
    const first = await connectedAs(owner);
    const firstSeesOwner = nextSignal(first, PRESENCE_UPDATE, onlineIs(owner.id));
    await join(first, { boardId: board.id });
    await firstSeesOwner;

    const firstSeesBoth = nextSignal(first, PRESENCE_UPDATE, onlineIs(owner.id, member.id));
    const second = await connectedAs(member);
    const secondSeesBoth = nextSignal(second, PRESENCE_UPDATE, onlineIs(owner.id, member.id));
    await join(second, { boardId: board.id });

    await Promise.all([firstSeesBoth, secondSeesBoth]);
  });

  it('counts a user with two tabs once', async () => {
    const { board, owner } = await createBoardWithRoles();
    const tab1 = await connectedAs(owner);
    await join(tab1, { boardId: board.id });
    const tab2 = await connectedAs(owner);

    const update = nextSignal(tab1, PRESENCE_UPDATE);
    await join(tab2, { boardId: board.id });

    expect(presenceUpdateSchema.parse(await update).userIds).toEqual([owner.id]);
  });

  it('drops a user who closes their tab or leaves the board', async () => {
    const { board, owner, member, viewer } = await createBoardWithRoles();
    const watcher = await connectedAs(owner);
    await join(watcher, { boardId: board.id });
    const closing = await connectedAs(member);
    await join(closing, { boardId: board.id });
    const leaving = await connectedAs(viewer);
    await join(leaving, { boardId: board.id });

    const afterClose = nextSignal(watcher, PRESENCE_UPDATE, onlineIs(owner.id, viewer.id));
    closing.disconnect();
    await afterClose;

    const afterLeave = nextSignal(watcher, PRESENCE_UPDATE, onlineIs(owner.id));
    leaving.emit('board:leave', { boardId: board.id });
    await afterLeave;
  });

  it('keeps a user online while another of their tabs is still open', async () => {
    const { board, owner, member } = await createBoardWithRoles();
    const watcher = await connectedAs(owner);
    await join(watcher, { boardId: board.id });
    const tab1 = await connectedAs(member);
    await join(tab1, { boardId: board.id });
    const tab2 = await connectedAs(member);
    await join(tab2, { boardId: board.id });

    const update = nextSignal(watcher, PRESENCE_UPDATE);
    tab1.disconnect();

    expect([...presenceUpdateSchema.parse(await update).userIds].sort()).toEqual(
      [owner.id, member.id].sort(),
    );
  });
});

describe('card drag cues', () => {
  async function boardWithWatcher() {
    const fixture = await createBoardWithRoles();
    const list = await createList(fixture.board._id);
    const card = await createCard(list);
    const watcher = await connectedAs(fixture.owner);
    await join(watcher, { boardId: fixture.board.id });
    return { ...fixture, card, watcher };
  }

  it("relays a member's drag start and end to the others, not back to the sender", async () => {
    const { board, member, card, watcher } = await boardWithWatcher();
    const dragger = await connectedAs(member);
    await join(dragger, { boardId: board.id });
    let echoes = 0;
    dragger.onAny((name: string) => {
      if (name === CARD_DRAGGING) echoes += 1;
    });

    const started = nextSignal(watcher, CARD_DRAGGING);
    dragger.emit(CARD_DRAG, { boardId: board.id, cardId: card.id });
    expect(cardDraggingSchema.parse(await started)).toEqual({
      boardId: board.id,
      userId: member.id,
      cardId: card.id,
    });

    const ended = nextSignal(watcher, CARD_DRAGGING);
    dragger.emit(CARD_DRAG, { boardId: board.id, cardId: null });
    expect(cardDraggingSchema.parse(await ended)).toMatchObject({ cardId: null });

    await roundTrip(dragger);
    expect(echoes).toBe(0);
  });

  it('ignores a drag from a viewer and from a socket that never joined', async () => {
    const { board, viewer, member, card, watcher } = await boardWithWatcher();
    let cues = 0;
    watcher.onAny((name: string) => {
      if (name === CARD_DRAGGING) cues += 1;
    });

    const viewerSocket = await connectedAs(viewer);
    await join(viewerSocket, { boardId: board.id });
    viewerSocket.emit(CARD_DRAG, { boardId: board.id, cardId: card.id });
    const outsiderSocket = await connectedAs(member);
    outsiderSocket.emit(CARD_DRAG, { boardId: board.id, cardId: card.id });

    await Promise.all([roundTrip(viewerSocket), roundTrip(outsiderSocket)]);
    await roundTrip(watcher);
    expect(cues).toBe(0);
  });

  it('ends the drag when the dragging tab closes mid-drag', async () => {
    const { board, member, card, watcher } = await boardWithWatcher();
    const dragger = await connectedAs(member);
    await join(dragger, { boardId: board.id });
    const started = nextSignal(watcher, CARD_DRAGGING);
    dragger.emit(CARD_DRAG, { boardId: board.id, cardId: card.id });
    await started;

    const ended = nextSignal(
      watcher,
      CARD_DRAGGING,
      (payload) => cardDraggingSchema.safeParse(payload).data?.cardId === null,
    );
    dragger.disconnect();
    expect(cardDraggingSchema.parse(await ended)).toMatchObject({ userId: member.id });
  });
});

describe('socket message limit', () => {
  it('drops messages over the per-socket limit', async () => {
    // A separate server with a tiny limit and a long window, so the count is exact.
    const limitedHttp = createServer(app);
    const limited = createRealtimeServer(limitedHttp, {
      messageLimit: { max: 5, windowMs: 60_000 },
    });
    await new Promise<void>((resolve) => limitedHttp.listen(0, resolve));
    const limitedUrl = `http://localhost:${(limitedHttp.address() as AddressInfo).port}`;
    const connectTo = async (user: Parameters<typeof accessCookieFor>[0]) => {
      const socket: ClientSocket = connect(limitedUrl, {
        transports: ['websocket'],
        reconnection: false,
        extraHeaders: { cookie: await accessCookieFor(user), origin: CLIENT_ORIGIN },
      });
      openSockets.push(socket);
      expect(await connectResult(socket)).toEqual({ connected: true });
      return socket;
    };

    try {
      const { board, owner, member } = await createBoardWithRoles();
      const list = await createList(board._id);
      const card = await createCard(list);
      const watcher = await connectTo(owner);
      await join(watcher, { boardId: board.id });
      const dragger = await connectTo(member);
      await join(dragger, { boardId: board.id });
      let cues = 0;
      watcher.onAny((name: string) => {
        if (name === CARD_DRAGGING) cues += 1;
      });

      // The join used 1 of the dragger's 5 messages, so 4 of these 10 get through.
      for (let i = 0; i < 10; i += 1) {
        dragger.emit(CARD_DRAG, { boardId: board.id, cardId: card.id });
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(cues).toBe(4);
    } finally {
      await limited.close();
    }
  });
});
