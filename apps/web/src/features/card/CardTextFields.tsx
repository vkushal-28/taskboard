import type { CardDto } from '@taskboard/shared';
import { useId, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { useUpdateCard } from './api';

// Both fields keep a draft only while you edit (`null` otherwise), so a live update from
// someone else shows straight away unless you're mid-edit. Whoever saves last wins.

const MAX_TITLE = 200;
const MAX_DESCRIPTION = 5000;

interface FieldProps {
  card: CardDto;
  canEdit: boolean;
}

/** The card title, edited in place. Saves on Enter or blur; Escape discards. */
export function CardTitleField({ card, canEdit }: FieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  // Escape blurs the field, and the blur handler would still see the draft (state updates
  // land on the next render), so Escape leaves a note for it to discard instead.
  const discard = useRef(false);
  const update = useUpdateCard(card.boardId, card.id);

  if (!canEdit) return <h2 className="text-xl font-semibold text-slate-900">{card.title}</h2>;

  function save() {
    const title = draft?.trim();
    setDraft(null);
    if (discard.current) {
      discard.current = false;
      return;
    }
    if (!title || title === card.title) return;
    update.mutate({ title });
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') event.currentTarget.blur();
    if (event.key === 'Escape') {
      // Throw the draft away instead of closing the whole dialog.
      event.preventDefault();
      discard.current = true;
      event.currentTarget.blur();
    }
  }

  return (
    <input
      aria-label="Card title"
      value={draft ?? card.title}
      maxLength={MAX_TITLE}
      onFocus={() => setDraft(card.title)}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={save}
      onKeyDown={onKeyDown}
      className="-ml-2 w-full rounded-md border border-transparent px-2 py-1 text-xl font-semibold text-slate-900 hover:border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none"
    />
  );
}

/** The card description, edited in place. Saves on Save, ⌘/Ctrl+Enter or blur; Escape discards. */
export function CardDescriptionField({ card, canEdit }: FieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  // Set once the editor saves or cancels, so a blur that arrives while it closes (the textarea
  // losing focus as it unmounts) can't save a second time or save a cancelled draft.
  const closed = useRef(true);
  const update = useUpdateCard(card.boardId, card.id);
  const labelId = useId();

  const heading = (
    <h3 id={labelId} className="text-sm font-semibold text-slate-700">
      Description
    </h3>
  );

  if (!canEdit || draft === null) {
    return (
      <section>
        {heading}
        {canEdit ? (
          <button
            type="button"
            onClick={() => {
              closed.current = false;
              setDraft(card.description);
            }}
            aria-label={card.description ? 'Edit description' : 'Add a description'}
            className="mt-2 block w-full rounded-lg bg-slate-50 px-3 py-2 text-left text-sm whitespace-pre-wrap text-slate-700 hover:bg-slate-100"
          >
            {card.description || (
              <span className="text-slate-400">Add a more detailed description…</span>
            )}
          </button>
        ) : (
          <p className="mt-2 text-sm whitespace-pre-wrap text-slate-700">
            {card.description || <span className="text-slate-400">No description.</span>}
          </p>
        )}
      </section>
    );
  }

  const current = draft;
  function save() {
    if (closed.current) return;
    closed.current = true;
    setDraft(null);
    if (current !== card.description) update.mutate({ description: current });
  }

  function cancel() {
    closed.current = true;
    setDraft(null);
  }

  // Leaving the editor saves, like the title: closing the card or clicking elsewhere must not
  // drop what you typed. Focus moving to Save or Cancel isn't leaving.
  function onBlur(event: FocusEvent<HTMLElement>) {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    save();
  }

  return (
    <section onBlur={onBlur}>
      {heading}
      <textarea
        aria-labelledby={labelId}
        // Opening the editor is a deliberate click, so focus follows it.
        autoFocus
        value={draft}
        maxLength={MAX_DESCRIPTION}
        rows={6}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) save();
          if (event.key === 'Escape') {
            // Throw the draft away instead of closing the whole dialog.
            event.preventDefault();
            cancel();
          }
        }}
        className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none"
      />
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          // Keeps focus in the textarea, so its blur doesn't save before the click lands.
          onMouseDown={(event) => event.preventDefault()}
          onClick={save}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Save
        </button>
        <button
          type="button"
          // Without this, the textarea's blur would save the draft before Cancel is clicked
          // (and Safari doesn't focus buttons on click, so relatedTarget can't tell).
          onMouseDown={(event) => event.preventDefault()}
          onClick={cancel}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          Cancel
        </button>
        <span className="ml-auto self-center text-xs text-slate-400">⌘/Ctrl + Enter to save</span>
      </div>
    </section>
  );
}
