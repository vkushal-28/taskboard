import type { BoardMemberDto, CardDto } from '@taskboard/shared';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Avatar } from '../../components/Avatar';
import { showToast } from '../../lib/toast-store';
import { useDeleteCard, useUpdateCard } from './api';

export const LABEL_COLORS = [
  { value: '#16a34a', name: 'Green' },
  { value: '#ca8a04', name: 'Yellow' },
  { value: '#ea580c', name: 'Orange' },
  { value: '#dc2626', name: 'Red' },
  { value: '#7c3aed', name: 'Violet' },
  { value: '#2563eb', name: 'Blue' },
];
const MAX_LABELS = 10;

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

function SidebarButton({
  children,
  onClick,
  expanded,
}: {
  children: ReactNode;
  onClick: () => void;
  expanded?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      className="block w-full rounded-lg bg-slate-200/70 px-3 py-1.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-300/50 aria-expanded:bg-slate-300/50"
    >
      {children}
    </button>
  );
}

const panelClass = 'rounded-lg border border-slate-200 bg-white p-3 shadow-sm';

function MembersPanel({ card, members }: { card: CardDto; members: BoardMemberDto[] }) {
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

function LabelsPanel({ card }: { card: CardDto }) {
  const update = useUpdateCard(card.boardId, card.id);
  const [name, setName] = useState('');
  const [color, setColor] = useState(LABEL_COLORS[0]?.value ?? '#16a34a');

  function add(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (card.labels.some((label) => label.name.toLowerCase() === trimmed.toLowerCase())) {
      showToast(`This card already has a "${trimmed}" label.`, 'info');
      return;
    }
    update.mutate(
      { labels: [...card.labels, { name: trimmed, color }] },
      { onSuccess: () => setName('') },
    );
  }

  return (
    <div className={panelClass}>
      {card.labels.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-1">
          {card.labels.map((label) => (
            <li key={label.name}>
              <button
                type="button"
                disabled={update.isPending}
                onClick={() =>
                  update.mutate({
                    labels: card.labels.filter((other) => other.name !== label.name),
                  })
                }
                aria-label={`Remove label ${label.name}`}
                className="rounded px-1.5 py-0.5 text-[11px] font-medium text-white"
                style={{ backgroundColor: label.color }}
              >
                {label.name} ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {card.labels.length < MAX_LABELS && (
        <form onSubmit={add} className="space-y-2">
          <input
            aria-label="Label name"
            placeholder="Label name"
            value={name}
            maxLength={30}
            onChange={(event) => setName(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <fieldset className="flex gap-1.5">
            <legend className="sr-only">Label colour</legend>
            {LABEL_COLORS.map((option) => (
              <label key={option.value} title={option.name}>
                <input
                  type="radio"
                  name={`label-color-${card.id}`}
                  value={option.value}
                  checked={color === option.value}
                  onChange={() => setColor(option.value)}
                  className="peer sr-only"
                  aria-label={option.name}
                />
                <span
                  className="block h-6 w-6 cursor-pointer rounded-full ring-offset-2 peer-checked:ring-2 peer-checked:ring-slate-900 peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-400"
                  style={{ backgroundColor: option.value }}
                />
              </label>
            ))}
          </fieldset>
          <button
            type="submit"
            disabled={update.isPending}
            className="rounded-lg bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-200"
          >
            Add label
          </button>
        </form>
      )}
    </div>
  );
}

// <input type="date"> works in local dates. Noon keeps the day the same in every time zone
// within ±11 hours, so "due on the 14th" doesn't become the 13th for a teammate abroad.
export function dateInputToIso(value: string): string {
  return new Date(`${value}T12:00:00`).toISOString();
}

export function isoToDateInput(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function DueDatePanel({ card }: { card: CardDto }) {
  const update = useUpdateCard(card.boardId, card.id);

  return (
    <div className={`${panelClass} space-y-2`}>
      <input
        type="date"
        aria-label="Due date"
        value={card.dueDate ? isoToDateInput(card.dueDate) : ''}
        disabled={update.isPending}
        onChange={(event) =>
          update.mutate({ dueDate: event.target.value ? dateInputToIso(event.target.value) : null })
        }
        className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm"
      />
      {card.dueDate && (
        <button
          type="button"
          disabled={update.isPending}
          onClick={() => update.mutate({ dueDate: null })}
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          Remove due date
        </button>
      )}
    </div>
  );
}

function CardActions({ card, onClose, setLeaving }: Omit<CardSidebarProps, 'members'>) {
  const archive = useUpdateCard(card.boardId, card.id);
  const remove = useDeleteCard(card.boardId, card.id);
  const [confirming, setConfirming] = useState(false);

  // mutateAsync, not mutate(…, { onSuccess }): the socket echo of this write often arrives
  // before the response and removes the card, which unmounts this modal, and TanStack Query
  // skips mutate's per-call callbacks after an unmount. The promise still settles.
  function leaveAfter(write: Promise<unknown>, message: string) {
    setLeaving(true);
    write.then(
      () => {
        showToast(message, 'info');
        onClose();
      },
      () => setLeaving(false),
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Actions</h3>
      <SidebarButton
        onClick={() => leaveAfter(archive.mutateAsync({ archived: true }), 'Card archived.')}
      >
        Archive
      </SidebarButton>
      {confirming ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-800">
            Delete this card for everyone? This can't be undone.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={remove.isPending}
              onClick={() => leaveAfter(remove.mutateAsync(), 'Card deleted.')}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
            >
              Delete card
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-white"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <SidebarButton onClick={() => setConfirming(true)}>Delete…</SidebarButton>
      )}
    </div>
  );
}
