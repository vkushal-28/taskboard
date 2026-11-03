import {
  boardEventSchemas,
  type BoardDetail,
  type BoardEventName,
  type BoardEventPayload,
  type CardDto,
} from '@taskboard/shared';

/** One socket event with its payload, narrowed by `name`. */
export type BoardEvent = {
  [E in BoardEventName]: { name: E; payload: BoardEventPayload<E> };
}[BoardEventName];

/** Checks a socket payload against the shared schema. Anything malformed is dropped. */
export function parseBoardEvent(name: BoardEventName, payload: unknown): BoardEvent | null {
  const result = boardEventSchemas[name].safeParse(payload);
  // TypeScript can't tie `result.data` to `name` through the schema lookup; the lookup by the
  // same `name` guarantees the pair matches.
  return result.success ? ({ name, payload: result.data } as BoardEvent) : null;
}

// Idempotent, so an item that already arrived (from our own request, an echo of it, or a
// refetch) is not added twice.
export function appendIfMissing<T extends { id: string }>(items: T[], item: T): T[] {
  return items.some((existing) => existing.id === item.id) ? items : [...items, item];
}

/** Replaces the item with the same id, or appends it if this client never saw it. */
function upsert<T extends { id: string }>(items: T[], item: T): T[] {
  return items.some((existing) => existing.id === item.id)
    ? items.map((existing) => (existing.id === item.id ? item : existing))
    : [...items, item];
}

// The board view only holds visible cards, the same as GET /boards/:id.
function putCard(cards: CardDto[], card: CardDto): CardDto[] {
  return card.archived ? cards.filter((existing) => existing.id !== card.id) : upsert(cards, card);
}

/**
 * Applies a server event to the cached board. Every case is safe to apply twice, because the
 * user's own events arrive too (ADR 011). `board:deleted` is handled by the caller.
 */
export function applyBoardEvent(detail: BoardDetail, event: BoardEvent): BoardDetail {
  switch (event.name) {
    case 'card:created':
      return { ...detail, cards: appendIfMissing(detail.cards, event.payload.card) };
    case 'card:updated':
    case 'card:moved':
      return { ...detail, cards: putCard(detail.cards, event.payload.card) };
    case 'card:deleted': {
      const { cardId } = event.payload;
      return { ...detail, cards: detail.cards.filter((card) => card.id !== cardId) };
    }
    case 'list:created':
      return { ...detail, lists: appendIfMissing(detail.lists, event.payload.list) };
    case 'list:updated':
    case 'list:moved':
      return { ...detail, lists: upsert(detail.lists, event.payload.list) };
    case 'list:deleted': {
      // The api deletes a list's cards with it, so drop them here too.
      const { listId } = event.payload;
      return {
        ...detail,
        lists: detail.lists.filter((list) => list.id !== listId),
        cards: detail.cards.filter((card) => card.listId !== listId),
      };
    }
    case 'board:updated': {
      const { title, color } = event.payload.board;
      return { ...detail, board: { ...detail.board, title, color } };
    }
    case 'board:deleted':
      return detail;
  }
}

/** The card an event changes, for the in-flight move guard. */
export function cardIdOf(event: BoardEvent): string | undefined {
  switch (event.name) {
    case 'card:updated':
    case 'card:moved':
      return event.payload.card.id;
    case 'card:deleted':
      return event.payload.cardId;
    default:
      return undefined;
  }
}
