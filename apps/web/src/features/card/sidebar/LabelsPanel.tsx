import type { CardDto } from '@taskboard/shared';
import { useState, type FormEvent } from 'react';
import { showToast } from '../../../lib/toast-store';
import { useUpdateCard } from '../api';
import { panelClass } from './SidebarButton';

const LABEL_COLORS = [
  { value: '#16a34a', name: 'Green' },
  { value: '#ca8a04', name: 'Yellow' },
  { value: '#ea580c', name: 'Orange' },
  { value: '#dc2626', name: 'Red' },
  { value: '#7c3aed', name: 'Violet' },
  { value: '#2563eb', name: 'Blue' },
];
const MAX_LABELS = 10;

export function LabelsPanel({ card }: { card: CardDto }) {
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
