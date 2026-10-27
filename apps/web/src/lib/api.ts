import { env } from '../config/env';
import { clearSession } from '../features/auth/keys';
import { createApiClient } from './api-client';
import { queryClient } from './query-client';

export const api = createApiClient({
  baseUrl: env.VITE_API_URL,
  // The user becomes null, so every ProtectedRoute redirects to /login.
  onSessionExpired: () => clearSession(queryClient),
});
