import {
  boardDetailSchema,
  boardListResponseSchema,
  type BoardDetail,
  type CreateBoardInput,
} from '@taskboard/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { activityKeys } from '../activity/api';
import { mergeBoardDetail } from '../board/live-events';

export const boardKeys = {
  all: ['boards'] as const,
  list: () => [...boardKeys.all, 'list'] as const,
  detail: (boardId: string) => [...boardKeys.all, 'detail', boardId] as const,
};

export function useBoards() {
  return useQuery({
    queryKey: boardKeys.list(),
    queryFn: async ({ signal }) => {
      const { boards } = await api.request('/boards', { schema: boardListResponseSchema, signal });
      return boards;
    },
  });
}

export function useBoard(boardId: string) {
  return useQuery({
    queryKey: boardKeys.detail(boardId),
    queryFn: ({ signal }) =>
      api.request(`/boards/${boardId}`, { schema: boardDetailSchema, signal }),
    // A refetch must not roll back a card that a socket event updated while it was in flight.
    // TanStack types both arguments as unknown; this query only ever holds a BoardDetail.
    structuralSharing: (held, fetched) =>
      mergeBoardDetail(held as BoardDetail | undefined, fetched as BoardDetail),
  });
}

export function useCreateBoard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBoardInput) =>
      api.request('/boards', { method: 'POST', body: input, schema: boardDetailSchema }),
    onSuccess: (detail: BoardDetail) => {
      // The response is the full board, so the board page can open without another request.
      queryClient.setQueryData(boardKeys.detail(detail.board.id), detail);
      void queryClient.invalidateQueries({ queryKey: boardKeys.list() });
      void queryClient.invalidateQueries({ queryKey: activityKeys.all });
    },
  });
}
