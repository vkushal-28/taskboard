import type { BoardDetail } from '@taskboard/shared';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { queryClient } from '../../lib/query-client';
import { useToastStore } from '../../lib/toast-store';
import { boardDetail, card } from '../../test/board-fixtures';
import { errorResponse, json } from '../../test/http';
import { stubApi } from '../../test/render';
import { boardKeys, useBoard } from '../boards/api';
import { MOVE_FAILED_MESSAGE, useMoveCard } from './api';
import { groupCards, planMove } from './ordering';

const KEY = boardKeys.detail('b1');

function deferred() {
  let resolve: (response: Response) => void = () => {};
  const promise = new Promise<Response>((done) => (resolve = done));
  return { promise, resolve };
}

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

// useBoard keeps the board query active, so an invalidation actually refetches it.
function renderMoveHook() {
  return renderHook(() => ({ move: useMoveCard('b1'), board: useBoard('b1') }), { wrapper });
}

const cached = () => queryClient.getQueryData<BoardDetail>(KEY);
const toastMessages = () => useToastStore.getState().toasts.map((toast) => toast.message);

function moveC1ToInProgress() {
  const plan = planMove(boardDetail(), 'c1', 'l2', 1);
  if (!plan) throw new Error('expected a move');
  return plan;
}

beforeEach(() => {
  queryClient.clear();
  queryClient.setQueryData(KEY, boardDetail());
});

describe('useMoveCard', () => {
  it('moves the card in the cache before the server answers, then keeps the server copy', async () => {
    const response = deferred();
    let sentBody: unknown;
    stubApi({
      'PATCH /cards/c1/move': (init) => {
        sentBody = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
        return response.promise;
      },
    });
    const { result } = renderMoveHook();

    act(() => result.current.move.mutate(moveC1ToInProgress()));

    await waitFor(() => expect(groupCards(cached() ?? boardDetail()).l2).toEqual(['c4', 'c1']));
    expect(sentBody).toEqual({ listId: 'l2', beforeId: 'c4' });

    response.resolve(json(200, { card: card('c1', 'l2', 'a0V') }));
    await waitFor(() => expect(result.current.move.isSuccess).toBe(true));
    expect(cached()?.cards.find((c) => c.id === 'c1')).toMatchObject({
      listId: 'l2',
      position: 'a0V',
    });
  });

  it('rolls back, shows a toast and refetches when the move fails', async () => {
    const refetch = deferred();
    let boardFetches = 0;
    stubApi({
      'PATCH /cards/c1/move': () => errorResponse(500, 'INTERNAL'),
      'GET /boards/b1': () => {
        boardFetches += 1;
        return refetch.promise;
      },
    });
    const { result } = renderMoveHook();
    // Mounting useBoard fetches once (seeded data is stale); onMutate cancels that fetch.
    await waitFor(() => expect(boardFetches).toBe(1));

    act(() => result.current.move.mutate(moveC1ToInProgress()));

    await waitFor(() => expect(result.current.move.isError).toBe(true));
    // The refetch is still pending, so this is the rollback, not fresh server data.
    expect(groupCards(cached() ?? boardDetail())).toEqual(groupCards(boardDetail()));
    expect(toastMessages()).toEqual([MOVE_FAILED_MESSAGE]);
    await waitFor(() => expect(boardFetches).toBe(2));
    refetch.resolve(json(200, boardDetail()));
  });

  it("shows the server's message when someone else reordered first", async () => {
    stubApi({
      'PATCH /cards/c1/move': () =>
        errorResponse(409, 'CONFLICT', 'The order changed while you were editing.'),
      'GET /boards/b1': () => json(200, boardDetail()),
    });
    const { result } = renderMoveHook();

    act(() => result.current.move.mutate(moveC1ToInProgress()));

    await waitFor(() => expect(result.current.move.isError).toBe(true));
    expect(toastMessages()).toEqual(['The order changed while you were editing.']);
  });
});
