import {
  acceptInviteResponseSchema,
  invitePreviewSchema,
  type InviteErrorCode,
  type InvitePreview,
  type Role,
} from '@taskboard/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { FullPageSpinner } from '../../components/FullPageSpinner';
import { api } from '../../lib/api';
import { describeError, isApiError } from '../../lib/api-error';
import { showToast } from '../../lib/toast-store';
import { useLogout } from '../auth/api';
import { boardKeys } from '../boards/api';

const ROLE_NAMES: Record<Exclude<Role, 'owner'>, string> = {
  member: 'a member',
  viewer: 'a viewer',
};

// The server's message says what happened; the title names it at a glance.
const ERROR_TITLES: Record<InviteErrorCode, string> = {
  INVITE_NOT_FOUND: 'This invite link isn’t valid',
  INVITE_EXPIRED: 'This invite has expired',
  INVITE_REVOKED: 'This invite was revoked',
  INVITE_USED: 'This invite was already used',
  INVITE_WRONG_ACCOUNT: 'This invite is for another account',
};

function errorCodeOf(error: unknown): InviteErrorCode | null {
  if (!isApiError(error)) return null;
  return error.code in ERROR_TITLES ? (error.code as InviteErrorCode) : null;
}

/** `/invite/:token`. Behind ProtectedRoute, so a signed-out visitor signs in first and returns. */
export function InviteAcceptPage() {
  const token = useParams().token ?? '';
  const preview = useQuery({
    queryKey: ['invite', token],
    queryFn: ({ signal }) =>
      api.request(`/invites/${encodeURIComponent(token)}`, { schema: invitePreviewSchema, signal }),
  });

  if (preview.isPending) return <FullPageSpinner />;
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        data-testid="invite-page"
      >
        {preview.isError ? (
          <InviteError error={preview.error} />
        ) : (
          <InviteOffer token={token} preview={preview.data} />
        )}
      </div>
    </main>
  );
}

function InviteOffer({ token, preview }: { token: string; preview: InvitePreview }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const accept = useMutation({
    mutationFn: () =>
      api.request(`/invites/${encodeURIComponent(token)}/accept`, {
        method: 'POST',
        schema: acceptInviteResponseSchema,
      }),
    onSuccess: ({ boardId }) => {
      void queryClient.invalidateQueries({ queryKey: boardKeys.list() });
      showToast(`You joined ${preview.board.title}.`, 'info');
      // Replace, so Back doesn't return to a link that no longer works.
      void navigate(`/b/${boardId}`, { replace: true });
    },
  });
  const inviter = preview.invitedBy?.name ?? 'Someone';

  if (accept.isError && errorCodeOf(accept.error)) return <InviteError error={accept.error} />;

  return (
    <>
      <div className="h-2 rounded-full" style={{ backgroundColor: preview.board.color }} />
      <h1 className="mt-4 text-lg font-semibold text-slate-900">Join {preview.board.title}</h1>
      <p className="mt-2 text-sm text-slate-600">
        {inviter} invited you to join <strong>{preview.board.title}</strong> as{' '}
        {ROLE_NAMES[preview.role]}.
      </p>
      {accept.isError && (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {describeError(accept.error)}
        </p>
      )}
      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={() => accept.mutate()}
          disabled={accept.isPending}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
        >
          {accept.isPending ? 'Joining…' : 'Accept invite'}
        </button>
        <Link to="/" className="text-sm text-slate-600 hover:text-slate-900">
          Not now
        </Link>
      </div>
    </>
  );
}

function InviteError({ error }: { error: unknown }) {
  const code = errorCodeOf(error);
  return (
    <>
      <h1 className="text-lg font-semibold text-slate-900">
        {code ? ERROR_TITLES[code] : 'Could not open this invite'}
      </h1>
      <p className="mt-2 text-sm text-slate-600">{describeError(error)}</p>
      <div className="mt-6 flex items-center gap-3">
        {code === 'INVITE_WRONG_ACCOUNT' ? <SwitchAccountButton /> : null}
        <Link to="/" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
          Go to your boards
        </Link>
      </div>
    </>
  );
}

// Signing out sends ProtectedRoute to /login with this invite as the way back.
function SwitchAccountButton(): ReactNode {
  const logout = useLogout();
  return (
    <button
      type="button"
      onClick={() => logout.mutate()}
      disabled={logout.isPending}
      className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
    >
      Sign out and switch account
    </button>
  );
}
