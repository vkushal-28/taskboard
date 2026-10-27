import {
  createCardSchema,
  type BoardMemberDto,
  type CardDto,
  type ListDto,
} from '@taskboard/shared';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useCreateCard } from './api';
import { SortableCard } from './CardTile';
import { InlineAddForm } from './InlineAddForm';

interface ListColumnProps {
  boardId: string;
  list: ListDto;
  cards: CardDto[];
  members: Map<string, BoardMemberDto>;
  canEdit: boolean;
}

export function ListColumn({ boardId, list, cards, members, canEdit }: ListColumnProps) {
  // The whole column is a drop target, so a card can be dropped into an empty list, below the
  // last card or on the header; dropOrder() puts it last.
  const { setNodeRef, isOver } = useDroppable({ id: list.id, data: { type: 'list' } });
  const createCard = useCreateCard(boardId, list.id);
  const headingId = `list-${list.id}`;

  return (
    <section
      ref={setNodeRef}
      aria-labelledby={headingId}
      data-testid={`list-${list.id}`}
      className="flex max-h-full w-72 shrink-0 flex-col rounded-xl bg-slate-100"
    >
      <header className="flex items-center justify-between px-3 pt-3 pb-2">
        <h2 id={headingId} className="text-sm font-semibold text-slate-800">
          {list.title}
        </h2>
        <span className="text-xs text-slate-500">{cards.length}</span>
      </header>

      <SortableContext items={cards.map((card) => card.id)} strategy={verticalListSortingStrategy}>
        <ol
          className={`min-h-12 flex-1 space-y-2 overflow-y-auto px-3 pb-2 ${
            isOver && cards.length === 0 ? 'rounded-lg bg-indigo-50' : ''
          }`}
        >
          {cards.map((card) => (
            <SortableCard
              key={card.id}
              card={card}
              members={members}
              listId={list.id}
              disabled={!canEdit}
            />
          ))}
        </ol>
      </SortableContext>

      {canEdit && (
        <div className="px-3 pb-3">
          <InlineAddForm
            openLabel="Add a card"
            fieldLabel="Card title"
            submitLabel="Add card"
            schema={createCardSchema.pick({ title: true })}
            onAdd={(title) => createCard.mutateAsync({ title, description: '' })}
            testId={`add-card-${list.id}`}
          />
        </div>
      )}
    </section>
  );
}
