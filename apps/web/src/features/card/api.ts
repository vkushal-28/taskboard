import {
  cardResponseSchema,
  type BoardDetail,
  type CardDto,
  type UpdateCardInput,
} from '@taskboard/shared';
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { describeError } from '../../lib/api-error';
import { showToast } from '../../lib/toast-store';
import { putCard } from '../board/live-events';
import { boardKeys } from '../boards/api';

// The card modal reads from the cached board, so every write lands there: the board view
// and the modal show the same card. Writes are not optimistic; each one stores the server's
// copy, which also makes a socket echo of the same write a no-op (ADR 011).
function storeCard(queryClient: QueryClient, boardId: string, card: CardDto): void {
  queryClient.setQueryData<BoardDetail>(boardKeys.detail(boardId), (detail) =>
    detail ? { ...detail, cards: putCard(detail.cards, card) } : detail,
  );
}

const reportError = (error: unknown) => showToast(describeError(error));

function useCardWrite<TInput>(boardId: string, send: (input: TInput) => Promise<CardDto>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: send,
    onSuccess: (card) => storeCard(queryClient, boardId, card),
    onError: reportError,
  });
}

async function cardRequest(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: object) {
  const { card } = await api.request(path, { method, body, schema: cardResponseSchema });
  return card;
}

export function useUpdateCard(boardId: string, cardId: string) {
  return useCardWrite(boardId, (input: UpdateCardInput) =>
    cardRequest(`/cards/${cardId}`, 'PATCH', input),
  );
}

export function useAddChecklistItem(boardId: string, cardId: string) {
  return useCardWrite(boardId, (text: string) =>
    cardRequest(`/cards/${cardId}/checklist`, 'POST', { text }),
  );
}

export function useUpdateChecklistItem(boardId: string, cardId: string, itemId: string) {
  return useCardWrite(boardId, (change: { text?: string; done?: boolean }) =>
    cardRequest(`/cards/${cardId}/checklist/${itemId}`, 'PATCH', change),
  );
}

export function useDeleteChecklistItem(boardId: string, cardId: string, itemId: string) {
  return useCardWrite(boardId, () => cardRequest(`/cards/${cardId}/checklist/${itemId}`, 'DELETE'));
}

export function useDeleteCard(boardId: string, cardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.request(`/cards/${cardId}`, { method: 'DELETE' }),
    onSuccess: () =>
      queryClient.setQueryData<BoardDetail>(boardKeys.detail(boardId), (detail) =>
        detail ? { ...detail, cards: detail.cards.filter((card) => card.id !== cardId) } : detail,
      ),
    onError: reportError,
  });
}
