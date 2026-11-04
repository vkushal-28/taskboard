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

/**
 * True when `incoming` is older than the copy already held. A response and a socket event
 * travel on different connections, so the newer one can arrive first (ADR 013).
 */
export function isOlderCard(incoming: CardDto, held: CardDto | undefined): boolean {
  return held !== undefined && held.version > incoming.version;
}

// The board view only holds visible cards, the same as GET /boards/:id. A copy older than
// the one held is ignored, so whichever arrives last can't roll the card back.
export function putCard(cards: CardDto[], card: CardDto): CardDto[] {
  if (
    isOlderCard(
      card,
      cards.find((existing) => existing.id === card.id),
    )
  )
    return cards;
  return card.archived ? cards.filter((existing) => existing.id !== card.id) : upsert(cards, card);
}

/**
 * For the board query's `structuralSharing`: a refetch that started before a newer write
 * reached this client keeps that newer card. Anything the server no longer returns is gone.
 */
export function mergeBoardDetail(held: BoardDetail | undefined, fetched: BoardDetail): BoardDetail {
  if (!held) return fetched;
  const heldById = new Map(held.cards.map((card) => [card.id, card]));
  return {
    ...fetched,
    cards: fetched.cards.map((card) => {
      const newer = heldById.get(card.id);
      return newer && isOlderCard(card, newer) ? newer : card;
    }),
  };
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
    // The card's new commentCount arrives as its own card:updated; comments aren't in the board.
    case 'comment:created':
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

/**
 * "Alex moved "Homepage" to Done", for a move someone else made to another list. Reorders
 * within a list stay quiet: they are frequent and the card is still where people look for it.
 */
export function describeRemoteMove(
  detail: BoardDetail,
  { actorId, card, fromListId }: BoardEventPayload<'card:moved'>,
): string | null {
  if (card.listId === fromListId) return null;
  const actor = detail.board.members.find((member) => member.id === actorId)?.name ?? 'Someone';
  const list = detail.lists.find((candidate) => candidate.id === card.listId)?.title;
  return list ? `${actor} moved "${card.title}" to ${list}` : null;
}
