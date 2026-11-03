import type { BoardMemberDto, CardDto } from '@taskboard/shared';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import { Avatar } from '../../components/Avatar';
import { useNow } from '../../lib/time';
import { useLiveStore } from './live-store';

const dueFormatter = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' });

interface CardTileProps {
  card: CardDto;
  members: Map<string, BoardMemberDto>;
}

/** The card's face. Also rendered inside the DragOverlay while a card is dragged. */
export function CardTile({ card, members }: CardTileProps) {
  const done = card.checklist.filter((item) => item.done).length;
  const assignees = card.assignees.flatMap((id) => members.get(id) ?? []);
  const now = useNow();
  const overdue = card.dueDate !== null && Date.parse(card.dueDate) < now;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm">
      {card.labels.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {card.labels.map((label) => (
            <span
              key={label.name}
              className="rounded px-1.5 py-0.5 text-[11px] font-medium text-white"
              style={{ backgroundColor: label.color }}
            >
              {label.name}
            </span>
          ))}
        </div>
      )}
      <p className="font-medium break-words text-slate-900">{card.title}</p>

      {(card.dueDate || card.checklist.length > 0 || assignees.length > 0) && (
        <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
          {card.dueDate && (
            <time
              dateTime={card.dueDate}
              className={overdue ? 'rounded bg-red-50 px-1 font-medium text-red-700' : undefined}
            >
              {overdue ? 'Overdue · ' : 'Due '}
              {dueFormatter.format(Date.parse(card.dueDate))}
            </time>
          )}
          {card.checklist.length > 0 && (
            <span
              aria-label={`Checklist ${done} of ${card.checklist.length} done`}
              className={done === card.checklist.length ? 'text-emerald-700' : undefined}
            >
              ☑ {done}/{card.checklist.length}
            </span>
          )}
          {assignees.length > 0 && (
            <span className="ml-auto flex -space-x-1.5">
              {assignees.map((member) => (
                <span
                  key={member.id}
                  title={member.name}
                  className="rounded-full ring-2 ring-white"
                >
                  <Avatar id={member.id} name={member.name} size="sm" />
                </span>
              ))}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

interface SortableCardProps extends CardTileProps {
  listId: string;
  disabled: boolean;
}

export function SortableCard({ card, members, listId, disabled }: SortableCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: 'card', listId },
    disabled,
  });
  const movingUserId = useLiveStore((state) => state.draggingByCard[card.id]);
  const movingName = movingUserId ? (members.get(movingUserId)?.name ?? 'Someone') : null;
  const navigate = useNavigate();
  const open = () => void navigate(`/b/${card.boardId}/c/${card.id}`);

  // Space picks the card up (BoardCanvas limits dnd-kit's keyboard sensor to Space), Enter
  // opens it. A click opens it too; the pointer sensor's 5 px threshold keeps drags apart.
  function onKeyDown(event: KeyboardEvent<HTMLLIElement>) {
    listeners?.onKeyDown?.(event);
    if (event.key === 'Enter' && !isDragging && !event.defaultPrevented) {
      event.preventDefault();
      open();
    }
  }

  return (
    <li
      ref={setNodeRef}
      data-testid={`card-${card.id}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      // The original stays in place as a faded gap; the DragOverlay follows the pointer.
      className={`list-none rounded-lg focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:outline-none ${
        isDragging ? 'opacity-40' : ''
      } ${disabled ? '' : 'cursor-grab active:cursor-grabbing'} ${
        movingName ? 'ring-2 ring-amber-400' : ''
      }`}
      aria-label={card.title}
      {...attributes}
      {...listeners}
      // Viewers can't drag, but the card still opens, so it isn't a disabled button.
      aria-disabled={undefined}
      onClick={open}
      onKeyDown={onKeyDown}
    >
      <CardTile card={card} members={members} />
      {movingName && (
        <p role="status" className="px-1 pt-1 text-xs font-medium text-amber-700">
          {movingName} is moving this
        </p>
      )}
    </li>
  );
}
