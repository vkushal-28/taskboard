import type { BoardMemberDto, CardDto } from '@taskboard/shared';
import { Avatar } from '../../../components/Avatar';
import { useUpdateCard } from '../api';
import { panelClass } from './SidebarButton';

export function MembersPanel({ card, members }: { card: CardDto; members: BoardMemberDto[] }) {
  const update = useUpdateCard(card.boardId, card.id);

  function toggle(memberId: string, assigned: boolean) {
    const assignees = assigned
      ? [...card.assignees, memberId]
      : card.assignees.filter((id) => id !== memberId);
    update.mutate({ assignees });
  }

  return (
    <fieldset className={panelClass} disabled={update.isPending}>
      <legend className="sr-only">Assign members</legend>
      {members.map((member) => (
        <label key={member.id} className="flex items-center gap-2 py-1 text-sm text-slate-800">
          <input
            type="checkbox"
            checked={card.assignees.includes(member.id)}
            onChange={(event) => toggle(member.id, event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-indigo-600"
          />
          <Avatar id={member.id} name={member.name} size="sm" />
          {member.name}
        </label>
      ))}
    </fieldset>
  );
}
