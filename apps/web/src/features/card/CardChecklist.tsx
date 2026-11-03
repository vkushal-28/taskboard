import { CHECKLIST_MAX_ITEMS, type CardDto } from '@taskboard/shared';
import { useRef, useState, type FormEvent } from 'react';
import { useAddChecklistItem, useDeleteChecklistItem, useUpdateChecklistItem } from './api';

type ChecklistItem = CardDto['checklist'][number];

interface CardChecklistProps {
  card: CardDto;
  canEdit: boolean;
}

export function CardChecklist({ card, canEdit }: CardChecklistProps) {
  const items = card.checklist;
  const done = items.filter((item) => item.done).length;
  const percent = items.length === 0 ? 0 : Math.round((done / items.length) * 100);

  if (items.length === 0 && !canEdit) return null;

  return (
    <section aria-labelledby={`checklist-${card.id}`}>
      <div className="flex items-baseline justify-between">
        <h3 id={`checklist-${card.id}`} className="text-sm font-semibold text-slate-700">
          Checklist
        </h3>
        {items.length > 0 && (
          <span className="text-xs text-slate-500">
            {done} of {items.length} done
          </span>
        )}
      </div>
      {items.length > 0 && (
        <div
          role="progressbar"
          aria-label="Checklist progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200"
        >
          <div
            className={`h-full rounded-full transition-[width] ${percent === 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
      <ul className="mt-3 space-y-1">
        {items.map((item) => (
          <ChecklistRow key={item.id} card={card} item={item} canEdit={canEdit} />
        ))}
      </ul>
      {canEdit && items.length < CHECKLIST_MAX_ITEMS && <AddItemForm card={card} />}
    </section>
  );
}

function ChecklistRow({
  card,
  item,
  canEdit,
}: {
  card: CardDto;
  item: ChecklistItem;
  canEdit: boolean;
}) {
  // One mutation per row, so only the item being saved is disabled.
  const update = useUpdateChecklistItem(card.boardId, card.id, item.id);
  const remove = useDeleteChecklistItem(card.boardId, card.id, item.id);
  const [draft, setDraft] = useState<string | null>(null);
  // Escape blurs the field first; this tells the blur handler not to save (see CardTitleField).
  const discard = useRef(false);
  const busy = update.isPending || remove.isPending;

  function saveText() {
    const text = draft?.trim();
    setDraft(null);
    if (discard.current) {
      discard.current = false;
      return;
    }
    if (text && text !== item.text) update.mutate({ text });
  }

  return (
    <li className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-slate-50">
      <input
        type="checkbox"
        checked={item.done}
        disabled={!canEdit || busy}
        aria-label={item.text}
        onChange={(event) => update.mutate({ done: event.target.checked })}
        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
      />
      {draft === null ? (
        <span
          className={`flex-1 text-sm ${item.done ? 'text-slate-400 line-through' : 'text-slate-800'}`}
        >
          {item.text}
        </span>
      ) : (
        <input
          aria-label={`Rename "${item.text}"`}
          // The user just pressed Rename, so focus follows.
          autoFocus
          value={draft}
          maxLength={200}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={saveText}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') {
              event.preventDefault();
              discard.current = true;
              event.currentTarget.blur();
            }
          }}
          className="flex-1 rounded border border-slate-300 px-2 py-0.5 text-sm focus:border-indigo-500 focus:outline-none"
        />
      )}
      {canEdit && draft === null && (
        <span className="flex gap-1 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
          <button
            type="button"
            onClick={() => setDraft(item.text)}
            disabled={busy}
            aria-label={`Rename "${item.text}"`}
            className="rounded px-1.5 text-xs text-slate-500 hover:bg-slate-200 hover:text-slate-800"
          >
            Rename
          </button>
          <button
            type="button"
            onClick={() => remove.mutate()}
            disabled={busy}
            aria-label={`Delete "${item.text}"`}
            className="rounded px-1.5 text-xs text-slate-500 hover:bg-red-50 hover:text-red-700"
          >
            Delete
          </button>
        </span>
      )}
    </li>
  );
}

function AddItemForm({ card }: { card: CardDto }) {
  const [text, setText] = useState('');
  const add = useAddChecklistItem(card.boardId, card.id);

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    // Clear only once saved, so a failed add keeps what was typed.
    add.mutate(trimmed, { onSuccess: () => setText('') });
  }

  return (
    <form onSubmit={submit} className="mt-2 flex gap-2">
      <input
        aria-label="New checklist item"
        placeholder="Add an item"
        value={text}
        maxLength={200}
        onChange={(event) => setText(event.target.value)}
        className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none"
      />
      <button
        type="submit"
        disabled={add.isPending}
        className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-60"
      >
        Add
      </button>
    </form>
  );
}
