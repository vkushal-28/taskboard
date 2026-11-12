import type { CardDto } from '@taskboard/shared';
import { useState, type ReactNode } from 'react';
import { CardComments } from './activity/CardComments';
import { CardHistory } from './activity/CardHistory';

type Tab = 'comments' | 'history';

interface CardActivityProps {
  card: CardDto;
  canEdit: boolean;
}

export function CardActivity({ card, canEdit }: CardActivityProps) {
  const [tab, setTab] = useState<Tab>('comments');

  return (
    <section aria-labelledby={`activity-${card.id}`}>
      <div className="flex items-center justify-between gap-3">
        <h3 id={`activity-${card.id}`} className="text-sm font-semibold text-slate-700">
          Activity
        </h3>
        {/* Toggle buttons, not ARIA tabs: tabs promise arrow-key navigation as well. */}
        <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium">
          <TabButton current={tab} value="comments" onSelect={setTab}>
            Comments{card.commentCount > 0 && ` (${card.commentCount})`}
          </TabButton>
          <TabButton current={tab} value="history" onSelect={setTab}>
            History
          </TabButton>
        </div>
      </div>
      <div className="mt-3">
        {tab === 'comments' ? (
          <CardComments card={card} canEdit={canEdit} />
        ) : (
          <CardHistory cardId={card.id} />
        )}
      </div>
    </section>
  );
}

function TabButton({
  current,
  value,
  onSelect,
  children,
}: {
  current: Tab;
  value: Tab;
  onSelect: (tab: Tab) => void;
  children: ReactNode;
}) {
  const selected = current === value;
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(value)}
      className={`rounded-md px-2.5 py-1 ${selected ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
    >
      {children}
    </button>
  );
}
