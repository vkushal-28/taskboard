/**
 * Share dialog data: pending invites (owners only) and member changes. Member changes update the
 * cached board's member list straight away.
 */
import {
  inviteListResponseSchema,
  inviteWithLinkResponseSchema,
  membersResponseSchema,
  type BoardDetail,
  type BoardMemberDto,
  type CreateInviteInput,
  type Role,
} from '@taskboard/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { describeError } from '../../lib/api-error';
import { showToast } from '../../lib/toast-store';
import { useAuth } from '../auth/api';
import { applyMembers } from '../board/live-events';
import { boardKeys } from '../boards/api';

const sharingKeys = {
  invites: (boardId: string) => ['invites', boardId] as const,
};

/** Writes the server's member list into the cached board, with the user's own role. */
function storeMembers(
  queryClient: QueryClient,
  boardId: string,
  userId: string | undefined,
  members: BoardMemberDto[],
): void {
  queryClient.setQueryData<BoardDetail>(boardKeys.detail(boardId), (detail) =>
    detail && userId ? (applyMembers(detail, members, userId) ?? detail) : detail,
  );
}

const reportError = (error: unknown) => showToast(describeError(error));

/** The board's pending invites (owners only). */
export function useInvites(boardId: string) {
  return useQuery({
    queryKey: sharingKeys.invites(boardId),
    queryFn: async ({ signal }) => {
      const { invites } = await api.request(`/boards/${boardId}/invites`, {
        schema: inviteListResponseSchema,
        signal,
      });
      return invites;
    },
  });
}

function useInviteWrite<TInput, TResult>(
  boardId: string,
  send: (input: TInput) => Promise<TResult>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: send,
    onSettled: () => queryClient.invalidateQueries({ queryKey: sharingKeys.invites(boardId) }),
  });
}

/** Creates an invite; the response carries the link to share. */
export function useCreateInvite(boardId: string) {
  return useInviteWrite(boardId, (input: CreateInviteInput) =>
    api.request(`/boards/${boardId}/invites`, {
      method: 'POST',
      body: input,
      schema: inviteWithLinkResponseSchema,
    }),
  );
}

/** Issues a new link for an invite; the old link stops working. */
export function useResendInvite(boardId: string) {
  return useInviteWrite(boardId, (inviteId: string) =>
    api.request(`/boards/${boardId}/invites/${inviteId}/resend`, {
      method: 'POST',
      schema: inviteWithLinkResponseSchema,
    }),
  );
}

/** Cancels an invite. */
export function useRevokeInvite(boardId: string) {
  return useInviteWrite(boardId, (inviteId: string) =>
    api.request(`/boards/${boardId}/invites/${inviteId}`, { method: 'DELETE' }),
  );
}

function useMemberWrite<TInput>(
  boardId: string,
  send: (input: TInput) => Promise<{ members: BoardMemberDto[] }>,
) {
  const queryClient = useQueryClient();
  const userId = useAuth().user?.id;
  return useMutation({
    mutationFn: send,
    onSuccess: ({ members }) => storeMembers(queryClient, boardId, userId, members),
    onError: reportError,
  });
}

/** Changes a member's role and updates the cached member list. */
export function useChangeRole(boardId: string) {
  return useMemberWrite(boardId, ({ userId, role }: { userId: string; role: Role }) =>
    api.request(`/boards/${boardId}/members/${userId}`, {
      method: 'PATCH',
      body: { role },
      schema: membersResponseSchema,
    }),
  );
}

/** Removes a member and updates the cached member list. */
export function useRemoveMember(boardId: string) {
  return useMemberWrite(boardId, (userId: string) =>
    api.request(`/boards/${boardId}/members/${userId}`, {
      method: 'DELETE',
      schema: membersResponseSchema,
    }),
  );
}
