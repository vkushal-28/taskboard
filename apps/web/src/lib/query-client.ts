import { QueryClient } from '@tanstack/react-query';
import { isApiError } from './api-error';

const MAX_RETRIES = 2;

// Retrying a 4xx repeats the same mistake; only network errors and 5xx are worth another try.
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (isApiError(error) && error.status < 500) return false;
  return failureCount < MAX_RETRIES;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetry, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}

export const queryClient = createQueryClient();
