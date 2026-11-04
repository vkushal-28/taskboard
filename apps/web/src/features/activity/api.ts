import { activityPageSchema, recentActivityResponseSchema } from '@taskboard/shared';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { pagePath } from '../../lib/pagination';

export const activityKeys = {
  all: ['activity'] as const,
  recent: (limit: number) => [...activityKeys.all, 'recent', limit] as const,
  cards: () => [...activityKeys.all, 'card'] as const,
  card: (cardId: string) => [...activityKeys.cards(), cardId] as const,
};

export function useRecentActivity(limit = 10) {
  return useQuery({
    queryKey: activityKeys.recent(limit),
    queryFn: async ({ signal }) => {
      const { activity } = await api.request(`/activity/recent?limit=${limit}`, {
        schema: recentActivityResponseSchema,
        signal,
      });
      return activity;
    },
  });
}

/** A card's history, newest first, one page at a time (ADR 014). */
export function useCardActivity(cardId: string) {
  return useInfiniteQuery({
    queryKey: activityKeys.card(cardId),
    queryFn: ({ pageParam, signal }) =>
      api.request(pagePath(`/cards/${cardId}/activity`, pageParam), {
        schema: activityPageSchema,
        signal,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}
