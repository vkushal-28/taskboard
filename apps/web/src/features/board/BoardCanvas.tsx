import { createListSchema, hasRole, type BoardDetail } from '@taskboard/shared';
import {
  closestCorners,
  pointerWithin,
  type CollisionDetection,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useMemo, useState } from 'react';
import { useCreateList, useMoveCard } from './api';
import { CardTile } from './CardTile';
import { InlineAddForm } from './InlineAddForm';
import { ListColumn } from './ListColumn';
import { byPosition, dropOrder, findListOf, groupCards, planMove, type Columns } from './ordering';

// Below this distance a press is a click, not a drag (Phase 5 opens the card on click).
const DRAG_ACTIVATION_PX = 5;

export function BoardCanvas({ detail }: { detail: BoardDetail }) {
  const boardId = detail.board.id;
  const canEdit = hasRole(detail.board.myRole, 'member');
  const moveCard = useMoveCard(boardId);
  const createList = useCreateList(boardId);

  // A working copy of the columns, so the card can hop between lists under the pointer without
  // touching the query cache. `base` is the cache value the copy belongs to.
  const [drag, setDrag] = useState<{ base: BoardDetail; columns: Columns } | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: DRAG_ACTIVATION_PX } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const lists = useMemo(() => [...detail.lists].sort(byPosition), [detail.lists]);
  const cardsById = useMemo(
    () => new Map(detail.cards.map((card) => [card.id, card])),
    [detail.cards],
  );
  const members = useMemo(
    () => new Map(detail.board.members.map((member) => [member.id, member])),
    [detail.board.members],
  );
  // The copy also wins after a drop, until the optimistic update reaches the cache (onMutate
  // awaits cancelQueries first). Rendering the cache in that gap puts the card back in its old
  // list for a frame, and the drop animation flies to it there.
  const showDragCopy = drag !== null && (activeId !== null || drag.base === detail);
  const columns = showDragCopy ? drag.columns : groupCards(detail);
  const activeCard = activeId ? cardsById.get(activeId) : undefined;

  function handleDragStart({ active }: DragStartEvent) {
    setActiveId(String(active.id));
    setDrag({ base: detail, columns: groupCards(detail) });
  }

  // Crossing into another list moves the card in the working copy. Reordering within one list
  // is drawn by SortableContext's transforms, so it is only applied on drop.
  function handleDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const cardId = String(active.id);
    const overId = String(over.id);
    const overType: unknown = over.data.current?.type;
    setDrag(
      (state) =>
        state && { ...state, columns: moveAcross(state.columns, cardId, overId, overType) },
    );
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    const cardId = String(active.id);
    const working = drag?.columns;
    setActiveId(null);
    const listId = working && findListOf(working, cardId);
    if (!over || !working || !listId) return setDrag(null);

    const overIsList = over.data.current?.type === 'list';
    const finalIds = dropOrder(working[listId] ?? [], cardId, String(over.id), overIsList);

    const plan = planMove(detail, cardId, listId, finalIds.indexOf(cardId));
    if (!plan) return setDrag(null);
    // Hold the dropped order (including a reorder within the list) until the cache catches up.
    setDrag({ base: detail, columns: { ...working, [listId]: finalIds } });
    moveCard.mutate(plan, { onSettled: () => setDrag(null) });
  }

  function cancelDrag() {
    setActiveId(null);
    setDrag(null);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerFirst}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={cancelDrag}
    >
      <div className="flex h-full items-start gap-4 overflow-x-auto px-4 pb-4 sm:px-6">
        {lists.map((list) => (
          <ListColumn
            key={list.id}
            boardId={boardId}
            list={list}
            cards={(columns[list.id] ?? []).flatMap((id) => cardsById.get(id) ?? [])}
            members={members}
            canEdit={canEdit}
          />
        ))}

        {canEdit && (
          <div className="w-72 shrink-0 rounded-xl bg-slate-100/70 p-3">
            <InlineAddForm
              openLabel="Add a list"
              fieldLabel="List title"
              submitLabel="Add list"
              schema={createListSchema}
              onAdd={(title) => createList.mutateAsync({ title })}
              testId="add-list"
            />
          </div>
        )}
      </div>

      <DragOverlay>
        {activeCard && (
          <div className="rotate-2 cursor-grabbing shadow-xl">
            <CardTile card={activeCard} members={members} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

/**
 * Whatever is under the pointer wins. Over a card inside a column both match, and the card
 * comes first because its corners are nearer the pointer. Over the empty part of a column only
 * the column matches, so the card goes last. closestCorners alone can pick the neighbouring
 * column near the bottom of a list, because that column's corner is closer. Keyboard drags have
 * no pointer and use closestCorners.
 */
const pointerFirst: CollisionDetection = (args) => {
  const underPointer = pointerWithin(args);
  return underPointer.length > 0 ? underPointer : closestCorners(args);
};

/** Moves the card into the hovered list, before the hovered card or at the end. */
function moveAcross(columns: Columns, cardId: string, overId: string, overType: unknown): Columns {
  const fromListId = findListOf(columns, cardId);
  const toListId = targetListId(columns, overId, overType);
  if (!fromListId || !toListId || fromListId === toListId) return columns;

  const target = columns[toListId] ?? [];
  const overIndex = target.indexOf(overId);
  const insertAt = overIndex === -1 ? target.length : overIndex;
  return {
    ...columns,
    [fromListId]: (columns[fromListId] ?? []).filter((id) => id !== cardId),
    [toListId]: [...target.slice(0, insertAt), cardId, ...target.slice(insertAt)],
  };
}

/** `overId` is a list id when hovering a list's empty area, otherwise a card id. */
function targetListId(columns: Columns, overId: string, overType: unknown): string | undefined {
  return overType === 'list' ? overId : findListOf(columns, overId);
}
