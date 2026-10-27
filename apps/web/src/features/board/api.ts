import {
  cardResponseSchema,
  listResponseSchema,
  type BoardDetail,
  type CreateCardInput,
  type CreateListInput,
} from '@taskboard/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { isApiError } from '../../lib/api-error';
import { showToast } from '../../lib/toast-store';
import { boardKeys } from '../boards/api';
import { applyMove, replaceCard, type MovePlan } from './ordering';

// Idempotent, so an item that already arrived (Phase 4: a socket event, or a refetch after a
// reconnect) is not added twice.
function appendIfMissing<T extends { id: string }>(items: T[], item: T): T[] {
  return items.some((existing) => existing.id === item.id) ? items : [...items, item];
}

export const MOVE_FAILED_MESSAGE = 'Could not move the card, so it went back to where it was.';

export function useCreateCard(boardId: string, listId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCardInput) =>
      api.request(`/lists/${listId}/cards`, {
        method: 'POST',
        body: input,
        schema: cardResponseSchema,
      }),
    onSuccess: ({ card }) =>
      queryClient.setQueryData<BoardDetail>(boardKeys.detail(boardId), (detail) =>
        detail ? { ...detail, cards: appendIfMissing(detail.cards, card) } : detail,
      ),
  });
}

export function useCreateList(boardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateListInput) =>
      api.request(`/boards/${boardId}/lists`, {
        method: 'POST',
        body: input,
        schema: listResponseSchema,
      }),
    onSuccess: ({ list }) =>
      queryClient.setQueryData<BoardDetail>(boardKeys.detail(boardId), (detail) =>
        detail ? { ...detail, lists: appendIfMissing(detail.lists, list) } : detail,
      ),
  });
}

/**
 * Moves a card optimistically: the cache changes before the request is sent, the server's
 * copy replaces it on success, and the previous cache comes back on failure.
 */
export function useMoveCard(boardId: string) {
  const queryClient = useQueryClient();
  const queryKey = boardKeys.detail(boardId);

  return useMutation({
    mutationFn: ({ cardId, listId, beforeId, afterId }: MovePlan) =>
      api.request(`/cards/${cardId}/move`, {
        method: 'PATCH',
        body: { listId, beforeId, afterId },
        schema: cardResponseSchema,
      }),

    onMutate: async (plan) => {
      // A board fetch that lands after this write would overwrite it with the old order.
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<BoardDetail>(queryKey);
      if (previous) queryClient.setQueryData(queryKey, applyMove(previous, plan));
      return { previous };
    },

    onSuccess: ({ card }) =>
      queryClient.setQueryData<BoardDetail>(queryKey, (detail) =>
        detail ? replaceCard(detail, card) : detail,
      ),

    onError: (error, _plan, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      // A 409 means someone else reordered first; its message says to refresh.
      showToast(isApiError(error, 409) ? error.message : MOVE_FAILED_MESSAGE);
      // The snapshot may predate another move that is still in flight, and after a 409 our
      // neighbours are stale either way, so take the server's order.
      void queryClient.invalidateQueries({ queryKey });
    },
  });
}
