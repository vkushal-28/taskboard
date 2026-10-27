import {
  authUserResponseSchema,
  type LoginInput,
  type PublicUser,
  type RegisterInput,
} from '@taskboard/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { isApiError } from '../../lib/api-error';
import { authKeys, clearSession } from './keys';

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

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) =>
      api.request('/auth/login', { method: 'POST', body: input, schema: authUserResponseSchema }),
    onSuccess: ({ user }) => queryClient.setQueryData(authKeys.me, user),
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterInput) =>
      api.request('/auth/register', {
        method: 'POST',
        body: input,
        schema: authUserResponseSchema,
      }),
    onSuccess: ({ user }) => queryClient.setQueryData(authKeys.me, user),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.request('/auth/logout', { method: 'POST' }),
    // Settled, not success: if the network call fails, the user still expects to be signed out here.
    onSettled: () => clearSession(queryClient),
  });
}
