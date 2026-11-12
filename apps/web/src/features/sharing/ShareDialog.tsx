import { zodResolver } from '@hookform/resolvers/zod';
import {
  createInviteSchema,
  DAY_MS,
  ROLE_LABELS,
  roleSchema,
  ROLES,
  type BoardDetail,
  type BoardMemberDto,
  type InviteDto,
} from '@taskboard/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Avatar } from '../../components/Avatar';
import { Dialog } from '../../components/Dialog';
import { FeedSkeleton } from '../../components/FeedSkeleton';
import { describeError } from '../../lib/api-error';
import { useNow } from '../../lib/time';
import { useAuth } from '../auth/api';
import {
  useChangeRole,
  useCreateInvite,
  useInvites,
  useRemoveMember,
  useResendInvite,
  useRevokeInvite,
} from './api';

/** The link from the last create or resend. The api returns it once, so it lives here only. */
interface IssuedLink {
  inviteId: string;
  email: string;
  link: string;
  emailed: boolean;
}

/** The Share button and its dialog. Owners only: BoardHeader doesn't render it for others. */
export function ShareButton({ board }: { board: BoardDetail['board'] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
      >
        Share
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Share "${board.title}"`}>
        <ShareContent board={board} />
      </Dialog>
    </>
  );
}

function ShareContent({ board }: { board: BoardDetail['board'] }) {
  const [issued, setIssued] = useState<IssuedLink | null>(null);
  // A revoked invite's link is dead, so stop offering it.
  const forgetIfShown = (inviteId: string) =>
    setIssued((current) => (current?.inviteId === inviteId ? null : current));
  return (
    <div className="space-y-6" data-testid="share-dialog">
      <InviteForm boardId={board.id} onIssued={setIssued} />
      {issued && <IssuedLinkBox issued={issued} />}
      <MemberList board={board} />
      <PendingInvites boardId={board.id} onIssued={setIssued} onRevoked={forgetIfShown} />
    </div>
  );
}

function InviteForm({
  boardId,
  onIssued,
}: {
  boardId: string;
  onIssued: (issued: IssuedLink) => void;
}) {
  const createInvite = useCreateInvite(boardId);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(createInviteSchema),
    defaultValues: { email: '', role: 'member' as const },
  });

  const submit = handleSubmit(async (input) => {
    try {
      const { invite, link, emailed } = await createInvite.mutateAsync(input);
      onIssued({ inviteId: invite.id, email: invite.email, link, emailed });
      reset();
    } catch (error) {
      setError('root.server', { message: describeError(error) });
    }
  });

  const error = errors.email?.message ?? errors.root?.server?.message;

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="space-y-2">
      <div className="flex gap-2">
        <input
          type="email"
          aria-label="Email address"
          placeholder="name@example.com"
          aria-invalid={error ? true : undefined}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none"
          {...register('email')}
        />
        <select
          aria-label="Role for the invite"
          className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
          {...register('role')}
        >
          <option value="member">Member</option>
          <option value="viewer">Viewer</option>
        </select>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
        >
          Invite
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  );
}

function IssuedLinkBox({ issued }: { issued: IssuedLink }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(issued.link);
      setCopied(true);
    } catch {
      // No clipboard access (an insecure origin, or a denied permission): the field is still
      // there to select by hand.
      setCopied(false);
    }
  }

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3" role="status">
      <p className="text-sm text-emerald-900">
        {issued.emailed
          ? `We emailed an invite to ${issued.email}. You can also send them this link:`
          : `Send this link to ${issued.email}:`}
      </p>
      <div className="mt-2 flex gap-2">
        <input
          readOnly
          aria-label="Invite link"
          value={issued.link}
          onFocus={(event) => event.currentTarget.select()}
          className="min-w-0 flex-1 rounded-md border border-emerald-300 bg-white px-2 py-1 font-mono text-xs"
        />
        <button
          type="button"
          onClick={() => void copy()}
          className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500"
        >
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
      <p className="mt-2 text-xs text-emerald-800">
        It works for 7 days, and only for {issued.email}.
      </p>
    </div>
  );
}

function MemberList({ board }: { board: BoardDetail['board'] }) {
  const userId = useAuth().user?.id;
  return (
    <section aria-labelledby="share-members">
      <h3 id="share-members" className="text-sm font-semibold text-slate-700">
        Members
      </h3>
      <ul className="mt-2 divide-y divide-slate-100">
        {board.members.map((member) => (
          <MemberRow
            key={member.id}
            boardId={board.id}
            member={member}
            isMe={member.id === userId}
          />
        ))}
      </ul>
    </section>
  );
}

function MemberRow({
  boardId,
  member,
  isMe,
}: {
  boardId: string;
  member: BoardMemberDto;
  isMe: boolean;
}) {
  // One mutation per row, so only the row being saved is disabled.
  const changeRole = useChangeRole(boardId);
  const remove = useRemoveMember(boardId);
  const busy = changeRole.isPending || remove.isPending;
  const name = isMe ? `${member.name} (you)` : member.name;

  return (
    <li className="flex items-center gap-3 py-2" data-testid={`member-${member.id}`}>
      <Avatar id={member.id} name={member.name} size="sm" />
      <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{name}</span>
      <select
        aria-label={`Role for ${member.name}`}
        value={member.role}
        disabled={busy}
        onChange={(event) => {
          const role = roleSchema.safeParse(event.target.value);
          if (role.success) changeRole.mutate({ userId: member.id, role: role.data });
        }}
        className="rounded-md border border-slate-300 px-2 py-1 text-sm disabled:opacity-60"
      >
        {ROLES.map((role) => (
          <option key={role} value={role}>
            {ROLE_LABELS[role]}
          </option>
        ))}
      </select>
      {/* Leaving a board isn't offered here; an owner can step down with the role select. The
          placeholder keeps the role selects lined up. */}
      {isMe ? (
        <span aria-hidden="true" className="w-[4.25rem]" />
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (window.confirm(`Remove ${member.name} from this board?`)) remove.mutate(member.id);
          }}
          aria-label={`Remove ${member.name}`}
          className="w-[4.25rem] rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
        >
          Remove
        </button>
      )}
    </li>
  );
}

function PendingInvites({
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
