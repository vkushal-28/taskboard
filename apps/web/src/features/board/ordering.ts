import type { BoardDetail, CardDto } from '@taskboard/shared';
import { generateKeyBetween } from 'fractional-indexing';

/** Card ids per list id, in display order. */
export type Columns = Record<string, string[]>;

export interface MovePlan {
  cardId: string;
  listId: string;
  /** The card that will sit directly above the moved one. */
  beforeId?: string;
  /** The card that will sit directly below the moved one. */
  afterId?: string;
  /** A local position for the optimistic update; the server picks the real one. */
  position: string;
}

// Plain string comparison, not localeCompare: positions sort by code unit, the way MongoDB
// sorts them. The id breaks ties exactly like the api's { position: 1, _id: 1 }.
export function byPosition(
  a: { position: string; id: string },
  b: { position: string; id: string },
) {
  if (a.position !== b.position) return a.position < b.position ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function groupCards(detail: BoardDetail): Columns {
  const columns: Columns = Object.fromEntries(detail.lists.map((list) => [list.id, []]));
  for (const card of [...detail.cards].sort(byPosition)) columns[card.listId]?.push(card.id);
  return columns;
}

export function findListOf(columns: Columns, cardId: string): string | undefined {
  return Object.keys(columns).find((listId) => columns[listId]?.includes(cardId));
}

/**
 * A list's order after a drop. Dropping onto a card takes that card's slot; dropping onto the
 * list itself (its header, the space below the cards, an empty list) puts the card last.
 */
export function dropOrder(ids: string[], cardId: string, overId: string, overIsList: boolean) {
  if (!ids.includes(cardId)) return ids;
  const others = ids.filter((id) => id !== cardId);
  if (overIsList) return [...others, cardId];
  const to = ids.indexOf(overId);
  if (to === -1) return ids;
  others.splice(to, 0, cardId);
  return others;
}

/**
 * Where a card lands when dropped at `index` of `listId`. Returns null when the drop leaves the
 * card where it already was, so no request is sent.
 */
export function planMove(
  detail: BoardDetail,
  cardId: string,
  listId: string,
  index: number,
): MovePlan | null {
  const columns = groupCards(detail);
  const fromListId = findListOf(columns, cardId);
  const target = columns[listId];
  if (!fromListId || !target) return null;

  // Neighbours come from the target list without the moved card, so `index` means "the slot
  // between these two cards" whether the card started in this list or another one.
  const others = target.filter((id) => id !== cardId);
  const slot = Math.max(0, Math.min(index, others.length));
  if (fromListId === listId && columns[fromListId]?.indexOf(cardId) === slot) return null;

  const beforeId = others[slot - 1];
  const afterId = others[slot];
  const positionOf = (id: string | undefined) =>
    detail.cards.find((card) => card.id === id)?.position ?? null;

  return {
    cardId,
    listId,
    beforeId,
    afterId,
    position: generateKeyBetween(positionOf(beforeId), positionOf(afterId)),
  };
}

export function applyMove(detail: BoardDetail, plan: MovePlan): BoardDetail {
  return {
    ...detail,
    cards: detail.cards.map((card) =>
      card.id === plan.cardId ? { ...card, listId: plan.listId, position: plan.position } : card,
    ),
  };
}

export function replaceCard(detail: BoardDetail, next: CardDto): BoardDetail {
  return { ...detail, cards: detail.cards.map((card) => (card.id === next.id ? next : card)) };
}
