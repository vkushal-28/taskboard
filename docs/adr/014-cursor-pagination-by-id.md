# ADR 014: Cursor pagination by `_id`, and a stored comment count

- **Status:** Accepted
- **Date:** 2026-11-03

## Context

Slice 5.2 adds three feeds that can grow without limit: a card's comments, a card's history and a board's activity. Each needs pages, newest first. Rows are added while someone reads, so page 2 must not repeat or skip rows when a new one lands on page 1.

The board view also shows a comment count on every card. The board is loaded in one request (`GET /boards/:boardId`), and that should stay cheap.

## Decision

1. **The cursor is the `_id` of the last item on the previous page.** The next page is `{ _id: { $lt: cursor } }`, sorted by `{ _id: -1 }`, with `limit + 1` rows fetched to learn whether another page exists. `nextCursor` is `null` on the last page. Indexes: comments `{ boardId, cardId, _id: -1 }`, activity `{ boardId, _id: -1 }` and `{ cardId, _id: -1 }`. `GET /activity/recent` sorts by `_id` too, so every feed has one order.
2. **Cards store `commentCount`.** `POST /cards/:cardId/comments` saves the comment, then runs one `findOneAndUpdate` with `$inc: { commentCount: 1, version: 1 }` (ADR 013). That update broadcasts the existing `card:updated`, so counts stay live with no new client code. The response returns both the comment and the card.

## Alternatives considered

- **Offset pagination (`?page=2`)**: a new comment shifts every row by one, so the next page repeats an item. It also gets slower as the offset grows.
- **A `(createdAt, _id)` cursor**: the exact creation order, but two fields to encode and an `$or` filter for ties. An ObjectId starts with its creation second, so `_id` order is already creation order to the second, and `_id` is unique, so ties can't happen.
- **Counting comments on each board load** (an aggregation over the board's comments): the count could never drift, but every board load pays for it, and the card DTO would need the count from somewhere else on every card write.

## Consequences

- Good: one unique field, one comparison and one index per feed. No gaps or repeats under concurrent inserts.
- Good: the board view needs no extra query for counts.
- Bad: within one second, ObjectIds made by different servers aren't strictly ordered, so two items from the same second may show in either order. Fine for a feed.
- Bad: saving the comment and bumping the count are two writes without a transaction (ADR 006). A crash between them leaves the count one low. If the card is deleted between the role check and the count update, the service deletes the comment and returns 404.
- Follow-ups: comments can't be edited or deleted yet. Deleting would need a `$inc: -1`.
