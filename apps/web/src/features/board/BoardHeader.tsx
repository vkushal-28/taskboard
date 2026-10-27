import type { BoardDetail } from '@taskboard/shared';
import { Avatar } from '../../components/Avatar';
import { RoleBadge } from '../../components/RoleBadge';

const MAX_AVATARS = 4;

export function BoardHeader({ board }: { board: BoardDetail['board'] }) {
  const shown = board.members.slice(0, MAX_AVATARS);
  const hidden = board.members.length - shown.length;

  return (
    <div
      className="flex flex-wrap items-center gap-3 border-b-4 bg-white px-4 py-3 sm:px-6"
      style={{ borderBottomColor: board.color }}
    >
      <h1 className="text-xl font-semibold text-slate-900">{board.title}</h1>
      <RoleBadge role={board.myRole} />

      <div className="ml-auto flex items-center gap-3">
        {/* Phase 4 replaces this with live presence; for now it lists the board's members. */}
        <div className="flex -space-x-2" aria-label={`${board.members.length} members`}>
          {shown.map((member) => (
            <span key={member.id} title={member.name} className="rounded-full ring-2 ring-white">
              <Avatar id={member.id} name={member.name} />
            </span>
          ))}
          {hidden > 0 && (
            <span className="grid h-8 w-8 place-items-center rounded-full bg-slate-200 text-xs font-medium text-slate-700 ring-2 ring-white">
              +{hidden}
            </span>
          )}
        </div>
        <SoonButton label="Filter" />
        {board.myRole === 'owner' && <SoonButton label="Share" />}
      </div>
    </div>
  );
}

function SoonButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      disabled
      title={`${label} is coming soon`}
      className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {label}
    </button>
  );
}
