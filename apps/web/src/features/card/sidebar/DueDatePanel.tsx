import type { CardDto } from '@taskboard/shared';
import { useUpdateCard } from '../api';
import { dateInputToIso, isoToDateInput } from '../date-input';
import { panelClass } from './SidebarButton';

/** Sets or removes the card's due date. */
export function DueDatePanel({ card }: { card: CardDto }) {
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
