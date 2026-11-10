import { env } from '../config/env';
import { authKeys, clearSession } from '../features/auth/keys';
import { announceSession } from '../features/auth/session-sync';
import { createApiClient } from './api-client';
import { queryClient } from './query-client';

export const api = createApiClient({
  baseUrl: env.apiUrl,
  // The user becomes null, so every ProtectedRoute redirects to /login.
  // The other tabs share the cookies, so their session is gone too. A visitor who was never
  // signed in also lands here (the first /auth/me), and that is no news for other tabs.
  onSessionExpired: () => {
    const hadUser = queryClient.getQueryData(authKeys.me) != null;
    clearSession(queryClient);
    if (hadUser) announceSession(null);
  },
});
