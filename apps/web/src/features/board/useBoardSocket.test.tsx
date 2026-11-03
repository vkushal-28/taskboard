import { BOARD_JOIN, CARD_DRAGGING, PRESENCE_UPDATE, type BoardDetail } from '@taskboard/shared';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { queryClient } from '../../lib/query-client';
import { useToastStore } from '../../lib/toast-store';
import { boardDetail, card } from '../../test/board-fixtures';
import { fakeSocket } from '../../test/fake-socket';
import { errorResponse, json } from '../../test/http';
import { emptyHomeHandlers, renderApp, stubApi } from '../../test/render';
import { authKeys } from '../auth/keys';
import { boardKeys, useBoard } from '../boards/api';
import { useMoveCard } from './api';
import { groupCards, planMove } from './ordering';
import { useLiveStore } from './live-store';
import { BOARD_DELETED_MESSAGE, sendCardDrag, useBoardSocket } from './useBoardSocket';

const KEY = boardKeys.detail('b1');
const priya = { id: 'u1', name: 'Priya Sharma', email: 'priya@acme.dev' };
const fromPriya = { boardId: 'b1', actorId: 'u1' };
const fromAlex = { boardId: 'b1', actorId: 'u2' };

const cached = () => queryClient.getQueryData<BoardDetail>(KEY) ?? boardDetail();

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

function deferred() {
  let resolve: (response: Response) => void = () => {};
  const promise = new Promise<Response>((done) => (resolve = done));
  return { promise, resolve };
}

/** Stubs the board fetch and counts it. useBoard keeps the query active, so refetches run. */
function renderSocketHook(handlers: Parameters<typeof stubApi>[0] = {}) {
  const fetches = { board: 0 };
  stubApi({
    'GET /boards/b1': () => {
      fetches.board += 1;
      return json(200, boardDetail());
    },
    ...handlers,
  });
  const hook = renderHook(
    () => {
      useBoardSocket('b1');
      return { board: useBoard('b1'), move: useMoveCard('b1') };
    },
    { wrapper },
  );
  return { ...hook, fetches };
}

beforeEach(() => {
  queryClient.clear();
  queryClient.setQueryData(authKeys.me, priya);
  queryClient.setQueryData(KEY, boardDetail());
});

describe('useBoardSocket', () => {
  it('joins the board room on mount and disconnects on unmount', async () => {
    const { unmount, fetches } = renderSocketHook();

    await waitFor(() =>
      expect(fakeSocket.emitted).toEqual([{ event: BOARD_JOIN, payload: { boardId: 'b1' } }]),
    );
    // The board fetch was already running when the join was acknowledged: no second fetch.
    await waitFor(() => expect(fetches.board).toBe(1));

    unmount();
    expect(fakeSocket.connected).toBe(false);
    expect(fakeSocket.listenerCount()).toBe(0);
  });

  it("applies another member's change to the cached board", async () => {
    renderSocketHook();
    await waitFor(() => expect(fakeSocket.emitted).toHaveLength(1));

    act(() =>
      fakeSocket.serverEmit('card:moved', {
        ...fromAlex,
        card: card('c1', 'l2', 'a1'),
        fromListId: 'l1',
      }),
    );

    expect(groupCards(cached())).toMatchObject({ l1: ['c2', 'c3'], l2: ['c4', 'c1'] });
  });

  it("applies the user's own events too, so their other tabs stay in sync (ADR 011)", async () => {
    renderSocketHook();
    await waitFor(() => expect(fakeSocket.emitted).toHaveLength(1));

    const created = { ...fromPriya, card: card('c9', 'l3', 'a0') };
    act(() => fakeSocket.serverEmit('card:created', created));
    // The tab that made the card gets the same event again; it must not add a duplicate.
    act(() => fakeSocket.serverEmit('card:created', created));

    expect(groupCards(cached()).l3).toEqual(['c9']);
  });

  it('ignores a malformed payload and events for another board', async () => {
    renderSocketHook();
    await waitFor(() => expect(fakeSocket.emitted).toHaveLength(1));

    act(() => fakeSocket.serverEmit('card:deleted', { ...fromAlex, cardId: 'c1' }));
    act(() =>
      fakeSocket.serverEmit('card:deleted', {
        boardId: 'b2',
        actorId: 'u2',
        cardId: 'c1',
        listId: 'l1',
      }),
    );

    expect(cached()).toEqual(boardDetail());
  });

  it('joins again and refetches the board after a reconnect', async () => {
    const { fetches } = renderSocketHook();
    await waitFor(() => expect(fetches.board).toBe(1));
    await waitFor(() => expect(queryClient.isFetching({ queryKey: KEY })).toBe(0));

    act(() => fakeSocket.reconnect());

    await waitFor(() => expect(fetches.board).toBe(2));
    expect(fakeSocket.emitted.filter((e) => e.event === BOARD_JOIN)).toHaveLength(2);
  });

  describe('while a move of the same card is in flight', () => {
    // Waits for the join and the first board fetch, so only the move and the event are live.
    async function startMove(handlers: Parameters<typeof stubApi>[0]) {
      const rendered = renderSocketHook(handlers);
      await waitFor(() => expect(fakeSocket.emitted).toHaveLength(1));
      await waitFor(() => expect(queryClient.isFetching({ queryKey: KEY })).toBe(0));
      const plan = planMove(boardDetail(), 'c1', 'l2', 1);
      if (!plan) throw new Error('expected a move');
      act(() => rendered.result.current.move.mutate(plan));
      return rendered;
    }

    it('skips the echo of its own move without refetching', async () => {
      const response = deferred();
      const { result, fetches } = await startMove({
        'PATCH /cards/c1/move': () => response.promise,
      });
      await waitFor(() => expect(groupCards(cached()).l2).toEqual(['c4', 'c1']));
      const fetchesBefore = fetches.board;

      const saved = card('c1', 'l2', 'a0V');
      act(() =>
        fakeSocket.serverEmit('card:moved', { ...fromPriya, card: saved, fromListId: 'l1' }),
      );
      response.resolve(json(200, { card: saved }));

      await waitFor(() => expect(result.current.move.isSuccess).toBe(true));
      expect(cached().cards.find((c) => c.id === 'c1')?.position).toBe('a0V');
      expect(fetches.board).toBe(fetchesBefore);
    });

    it('keeps the optimistic state, then refetches once the move settles', async () => {
      const response = deferred();
      const { result, fetches } = await startMove({
        'PATCH /cards/c1/move': () => response.promise,
      });
      await waitFor(() => expect(groupCards(cached()).l2).toEqual(['c4', 'c1']));
      const fetchesBefore = fetches.board;

      // Alex moved the same card to Done a moment after us.
      act(() =>
        fakeSocket.serverEmit('card:moved', {
          ...fromAlex,
          card: card('c1', 'l3', 'a0'),
          fromListId: 'l2',
        }),
      );
      expect(groupCards(cached()).l2).toEqual(['c4', 'c1']);
      expect(fetches.board).toBe(fetchesBefore);

      response.resolve(json(200, { card: card('c1', 'l2', 'a0V') }));
      await waitFor(() => expect(result.current.move.isSuccess).toBe(true));
      await waitFor(() => expect(fetches.board).toBe(fetchesBefore + 1));
    });
  });

  describe('when the server refuses the handshake', () => {
    it('refreshes the session once and connects again', async () => {
      let refreshes = 0;
      renderSocketHook({
        'POST /auth/refresh': () => {
          refreshes += 1;
          return json(200, { user: priya });
        },
      });
      await waitFor(() => expect(fakeSocket.emitted).toHaveLength(1));

      act(() => fakeSocket.refuse('UNAUTHORIZED'));

      await waitFor(() => expect(fakeSocket.emitted).toHaveLength(2));
      expect(fakeSocket.connected).toBe(true);
      expect(refreshes).toBe(1);
    });

    it('signs the user out when the refresh fails', async () => {
      renderSocketHook({ 'POST /auth/refresh': () => errorResponse(401, 'UNAUTHORIZED') });
      await waitFor(() => expect(fakeSocket.emitted).toHaveLength(1));

      act(() => fakeSocket.refuse('UNAUTHORIZED'));

      await waitFor(() => expect(queryClient.getQueryData(authKeys.me)).toBeNull());
      expect(fakeSocket.connected).toBe(false);
    });
  });
});

describe('board:deleted', () => {
  it('tells the user and takes them back to their boards', async () => {
    stubApi({
      'GET /auth/me': () => json(200, { user: priya }),
      'GET /boards/b1': () => json(200, boardDetail()),
      ...emptyHomeHandlers,
    });
    const { router } = renderApp('/b/b1');
    await screen.findByRole('heading', { name: 'Website Redesign', level: 1 });
    await waitFor(() => expect(fakeSocket.emitted).toHaveLength(1));

    act(() => fakeSocket.serverEmit('board:deleted', fromAlex));

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(useToastStore.getState().toasts.map((t) => t.message)).toEqual([BOARD_DELETED_MESSAGE]);
    await waitFor(() => expect(queryClient.getQueryData(KEY)).toBeUndefined());
  });
});

describe('presence and drag cues', () => {
  async function openBoard() {
    stubApi({
      'GET /auth/me': () => json(200, { user: priya }),
      'GET /boards/b1': () => json(200, boardDetail()),
    });
    renderApp('/b/b1');
    await screen.findByRole('heading', { name: 'Website Redesign', level: 1 });
    await waitFor(() => expect(fakeSocket.emitted).toHaveLength(1));
  }

  const toasts = () => useToastStore.getState().toasts.map((t) => t.message);

  it('shows who is online in the board header', async () => {
    await openBoard();

    act(() => fakeSocket.serverEmit(PRESENCE_UPDATE, { boardId: 'b1', userIds: ['u1', 'u2'] }));

    const presence = screen.getByTestId('presence');
    expect(presence).toHaveTextContent('2 online');
    expect(within(presence).getByTitle('Alex Kim is online')).toBeInTheDocument();
  });

  it('shows "<name> is moving this" on a card someone else drags, until they drop it', async () => {
    await openBoard();
    const tile = screen.getByTestId('card-c2');

    act(() => fakeSocket.serverEmit(CARD_DRAGGING, { boardId: 'b1', userId: 'u2', cardId: 'c2' }));
    expect(within(tile).getByRole('status')).toHaveTextContent('Alex Kim is moving this');

    act(() => fakeSocket.serverEmit(CARD_DRAGGING, { boardId: 'b1', userId: 'u2', cardId: null }));
    expect(within(tile).queryByRole('status')).not.toBeInTheDocument();
  });

  it('forgets presence and drag cues when the connection drops', async () => {
    await openBoard();
    act(() => fakeSocket.serverEmit(PRESENCE_UPDATE, { boardId: 'b1', userIds: ['u1', 'u2'] }));
    act(() => fakeSocket.serverEmit(CARD_DRAGGING, { boardId: 'b1', userId: 'u2', cardId: 'c2' }));

    act(() => fakeSocket.disconnect());

    expect(useLiveStore.getState()).toMatchObject({ onlineUserIds: [], draggingByCard: {} });
    expect(screen.queryByTestId('presence')).not.toBeInTheDocument();
  });

  it("shows a toast for someone else's move to another list, but not for the user's own", async () => {
    await openBoard();
    const move = (actorId: string, cardId: string) => ({
      boardId: 'b1',
      actorId,
      card: card(cardId, 'l3', 'a0'),
      fromListId: 'l1',
    });

    act(() => fakeSocket.serverEmit('card:moved', move('u1', 'c1')));
    act(() => fakeSocket.serverEmit('card:moved', move('u2', 'c2')));

    expect(toasts()).toEqual(['Alex Kim moved "Card c2" to Done']);
  });

  it('sends drag start and end only while connected', () => {
    sendCardDrag('b1', 'c1');
    expect(fakeSocket.emitted).toEqual([]);

    fakeSocket.connect();
    sendCardDrag('b1', 'c1');
    sendCardDrag('b1', null);
    expect(fakeSocket.emitted).toEqual([
      { event: 'card:drag', payload: { boardId: 'b1', cardId: 'c1' } },
      { event: 'card:drag', payload: { boardId: 'b1', cardId: null } },
    ]);
  });
});
