import type { QueryClient } from '@tanstack/react-query';

export const authKeys = {
  all: ['auth'] as const,
  me: ['auth', 'me'] as const,
};

// Used on sign-out and on session expiry, so the next user never sees the previous user's data.
// The auth query is updated in place, not removed: removing it would detach the route guards
// that observe it, and they would never see the user become null.
export function clearSession(queryClient: QueryClient): void {
  queryClient.setQueryData(authKeys.me, null);
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== authKeys.all[0] });
}
