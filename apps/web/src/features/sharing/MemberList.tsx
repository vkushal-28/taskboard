import {
  ROLE_LABELS,
  roleSchema,
  ROLES,
  type BoardDetail,
  type BoardMemberDto,
} from '@taskboard/shared';
import { Avatar } from '../../components/Avatar';
import { useAuth } from '../auth/api';
import { useChangeRole, useRemoveMember } from './api';

export function MemberList({ board }: { board: BoardDetail['board'] }) {
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
