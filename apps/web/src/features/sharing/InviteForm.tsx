import { zodResolver } from '@hookform/resolvers/zod';
import { createInviteSchema } from '@taskboard/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { describeError } from '../../lib/api-error';
import { useCreateInvite } from './api';
import type { IssuedLink } from './issued-link';

export function InviteForm({
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

export function IssuedLinkBox({ issued }: { issued: IssuedLink }) {
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
