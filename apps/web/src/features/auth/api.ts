/**
 * Auth hooks: who is signed in, and sign in / register / sign out. The current user lives in the
 * TanStack Query cache under `authKeys.me`; route guards read it.
 */
import {
  authUserResponseSchema,
  type LoginInput,
  type PublicUser,
  type RegisterInput,
} from '@taskboard/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { isApiError } from '../../lib/api-error';
import { showToast } from '../../lib/toast-store';
import { authKeys, clearSession } from './keys';
import { announceSession } from './session-sync';

// "Not signed in" is a normal state, not an error, so a 401 resolves to null.
async function fetchCurrentUser(): Promise<PublicUser | null> {
  try {
    const { user } = await api.request('/auth/me', { schema: authUserResponseSchema });
    return user;
  } catch (error) {
    if (isApiError(error, 401)) return null;
    throw error;
  }
}

/**
 * The signed-in user (`null` when signed out) from GET /auth/me. Route guards and the header read
 * it.
 */
export function useAuth() {
  const query = useQuery({
    queryKey: authKeys.me,
    queryFn: fetchCurrentUser,
    // The user only changes through the mutations below or a failed refresh, which all write
    // this cache entry directly.
    staleTime: Infinity,
  });
  return { user: query.data ?? null, isLoading: query.isPending, error: query.error };
}

/** Signs in, stores the user in the cache and tells other tabs. */
export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) =>
      api.request('/auth/login', { method: 'POST', body: input, schema: authUserResponseSchema }),
    onSuccess: ({ user }) => {
      queryClient.setQueryData(authKeys.me, user);
      announceSession(user.id);
    },
  });
}

/** Creates an account and signs in, like `useLogin`. */
export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterInput) =>
      api.request('/auth/register', {
        method: 'POST',
        body: input,
        schema: authUserResponseSchema,
      }),
    onSuccess: ({ user }) => {
      queryClient.setQueryData(authKeys.me, user);
      announceSession(user.id);
    },
  });
}

export const SIGN_OUT_FAILED_MESSAGE = 'Could not sign out. Check your connection and try again.';

/** Signs out, clears the cached data and tells other tabs. */
export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.request('/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      clearSession(queryClient);
      announceSession(null);
    },
    // The cookies are httpOnly, so only the server can end the session. Showing the user as
    // signed out after a failed request would be a lie: a reload would sign them back in.
    onError: () => showToast(SIGN_OUT_FAILED_MESSAGE),
  });
}
