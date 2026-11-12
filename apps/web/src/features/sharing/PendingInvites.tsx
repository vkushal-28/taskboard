import { DAY_MS, ROLE_LABELS, type InviteDto } from '@taskboard/shared';
import { useState } from 'react';
import { FeedSkeleton } from '../../components/FeedSkeleton';
import { describeError } from '../../lib/api-error';
import { useNow } from '../../lib/time';
import { useInvites, useResendInvite, useRevokeInvite } from './api';
import type { IssuedLink } from './issued-link';

/** Invites not yet accepted, each with Resend and Revoke and how long it has left. */
export function PendingInvites({
  boardId,
  onIssued,
  onRevoked,
}: {
  boardId: string;
  onIssued: (issued: IssuedLink) => void;
  onRevoked: (inviteId: string) => void;
}) {
  const invites = useInvites(boardId);
  const now = useNow();
  if (invites.isPending) return <FeedSkeleton label="Loading invites" rows={2} />;
  if (invites.isError) return <p className="text-sm text-red-600">Could not load invites.</p>;
  if (invites.data.length === 0) return null;

  return (
    <section aria-labelledby="share-invites">
      <h3 id="share-invites" className="text-sm font-semibold text-slate-700">
        Pending invites
      </h3>
      <ul className="mt-2 divide-y divide-slate-100">
        {invites.data.map((invite) => (
          <InviteRow
            key={invite.id}
            boardId={boardId}
            invite={invite}
            now={now}
            onIssued={onIssued}
            onRevoked={onRevoked}
          />
        ))}
      </ul>
    </section>
  );
}

function InviteRow({
  boardId,
  invite,
  now,
  onIssued,
  onRevoked,
}: {
  boardId: string;
  invite: InviteDto;
  now: number;
  onIssued: (issued: IssuedLink) => void;
  onRevoked: (inviteId: string) => void;
}) {
  const resend = useResendInvite(boardId);
  const revoke = useRevokeInvite(boardId);
  const [error, setError] = useState<string | null>(null);
  const busy = resend.isPending || revoke.isPending;

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(describeError(err));
    }
  }

  return (
    <li className="py-2" data-testid={`invite-${invite.id}`}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-slate-800">{invite.email}</p>
          <p className="text-xs text-slate-500">
            {ROLE_LABELS[invite.role]} · <ExpiryLabel expiresAt={invite.expiresAt} now={now} />
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const { link, emailed } = await resend.mutateAsync(invite.id);
              onIssued({ inviteId: invite.id, email: invite.email, link, emailed });
            })
          }
          aria-label={`Resend invite to ${invite.email}`}
          className="rounded-md px-2 py-1 text-sm text-indigo-600 hover:bg-indigo-50 disabled:opacity-60"
        >
          Resend
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await revoke.mutateAsync(invite.id);
              onRevoked(invite.id);
            })
          }
          aria-label={`Revoke invite to ${invite.email}`}
          className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
        >
          Revoke
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </li>
  );
}

// formatRelative only describes the past, so the countdown is worked out here. Rounded down:
// `now` is when the dialog opened, a little before an invite created in it, so rounding up
// would show a fresh 7-day invite as 8 days.
function ExpiryLabel({ expiresAt, now }: { expiresAt: string; now: number }) {
  const left = Date.parse(expiresAt) - now;
  if (left <= 0) return <span className="font-medium text-amber-700">Expired</span>;
  const days = Math.floor(left / DAY_MS);
  if (days < 1) return <span>Expires within a day</span>;
  return <span>{days === 1 ? 'Expires in 1 day' : `Expires in ${days} days`}</span>;
}
