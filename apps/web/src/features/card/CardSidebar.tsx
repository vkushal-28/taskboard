import type { BoardMemberDto, CardDto } from '@taskboard/shared';
import { useState } from 'react';
import { CardActions } from './sidebar/CardActions';
import { DueDatePanel } from './sidebar/DueDatePanel';
import { LabelsPanel } from './sidebar/LabelsPanel';
import { MembersPanel } from './sidebar/MembersPanel';
import { SidebarButton } from './sidebar/SidebarButton';

type Panel = 'members' | 'labels' | 'due';

interface CardSidebarProps {
  card: CardDto;
  members: BoardMemberDto[];
  onClose: () => void;
  /** True while this modal archives or deletes the card, so it isn't reported as "gone". */
  setLeaving: (leaving: boolean) => void;
}

/** "Add to card" and "Actions". Only rendered for members and owners. */
export function CardSidebar({ card, members, onClose, setLeaving }: CardSidebarProps) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const toggle = (next: Panel) => setPanel((current) => (current === next ? null : next));

  return (
    <aside className="space-y-6" aria-label="Card options">
      <div className="space-y-2">
        <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
          Add to card
        </h3>
        <SidebarButton expanded={panel === 'members'} onClick={() => toggle('members')}>
          Members
        </SidebarButton>
        {panel === 'members' && <MembersPanel card={card} members={members} />}
        <SidebarButton expanded={panel === 'labels'} onClick={() => toggle('labels')}>
          Labels
        </SidebarButton>
        {panel === 'labels' && <LabelsPanel card={card} />}
        <SidebarButton expanded={panel === 'due'} onClick={() => toggle('due')}>
          Due date
        </SidebarButton>
        {panel === 'due' && <DueDatePanel card={card} />}
        <SidebarButton
          onClick={() =>
            document.querySelector<HTMLInputElement>('[aria-label="New checklist item"]')?.focus()
          }
        >
          Checklist
        </SidebarButton>
      </div>
      <CardActions card={card} onClose={onClose} setLeaving={setLeaving} />
    </aside>
  );
}
