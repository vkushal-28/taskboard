import { recentActivityResponseSchema } from '@taskboard/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

export const activityKeys = {
  all: ['activity'] as const,
  recent: (limit: number) => [...activityKeys.all, 'recent', limit] as const,
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
