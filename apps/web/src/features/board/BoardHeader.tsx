import type { BoardDetail } from '@taskboard/shared';
import { Avatar } from '../../components/Avatar';
import { RoleBadge } from '../../components/RoleBadge';
import { ShareButton } from '../sharing/ShareDialog';
import { useLiveStore } from './live-store';

const MAX_AVATARS = 4;

export function BoardHeader({ board }: { board: BoardDetail['board'] }) {
  const onlineUserIds = useLiveStore((state) => state.onlineUserIds);
  // Members only: an id the cached board doesn't know yet (a brand-new member) has no name.
  const online = board.members.filter((member) => onlineUserIds.includes(member.id));
  // The viewer is always in the list once joined, so an empty one means "not known yet"
  // (connecting, or offline). Show the members dimmed rather than nobody.
  const live = online.length > 0;
  const people = live ? online : board.members;
  const shown = people.slice(0, MAX_AVATARS);
  const hidden = people.length - shown.length;

  return (
    <div
      className="flex flex-wrap items-center gap-3 border-b-4 bg-white px-4 py-3 sm:px-6"
      style={{ borderBottomColor: board.color }}
    >
      <h1 className="text-xl font-semibold text-slate-900">{board.title}</h1>
      <RoleBadge role={board.myRole} />

      <div className="ml-auto flex items-center gap-3">
        <div className="flex items-center gap-2" data-testid="presence">
          <div className={`flex -space-x-2 ${live ? '' : 'opacity-50'}`}>
            {shown.map((member) => (
              <span
                key={member.id}
                title={live ? `${member.name} is online` : member.name}
                className="rounded-full ring-2 ring-white"
              >
                <Avatar id={member.id} name={member.name} />
              </span>
            ))}
            {hidden > 0 && (
              <span className="grid h-8 w-8 place-items-center rounded-full bg-slate-200 text-xs font-medium text-slate-700 ring-2 ring-white">
                +{hidden}
              </span>
            )}
          </div>
          <span className="flex items-center gap-1.5 text-sm text-slate-600">
            {live ? (
              <>
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald-500" />
                {online.length} online
              </>
            ) : (
              `${board.members.length} ${board.members.length === 1 ? 'member' : 'members'}`
            )}
          </span>
        </div>
        <SoonButton label="Filter" />
        {board.myRole === 'owner' && <ShareButton board={board} />}
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
