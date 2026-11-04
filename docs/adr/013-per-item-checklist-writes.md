# ADR 013: Concurrent card writes: per-item checklist updates and card versions

- **Status:** Accepted
- **Date:** 2026-11-03

## Context

Phase 5 adds the card detail modal, where several people can edit one card at the same time. Two separate problems showed up.

**1. Lost writes on the server.** `PATCH /cards/:cardId` took the whole `checklist` array and replaced it. That's a read-modify-write: if Priya ticks item 1 while Alex ticks item 3, each sends a full array and the second undoes the first. The same pattern existed inside `updateCard` itself. It read the card, changed a field and saved, then returned the copy it had read, so a change someone else made in between was missing from the response.

**2. Stale copies on the client.** The browser check showed this one even after the server was fixed. Priya's tick and Alex's tick were both saved. But Priya's browser received Alex's `card:updated` event (both ticks) **before** the HTTP response to her own request (only her tick), because the socket and HTTP use different connections. Her older response arrived last and overwrote the newer state on her screen.

## Decision

1. **Checklist items are written one at a time,** each with a single atomic MongoDB update:
   - `POST /cards/:cardId/checklist` `{ text }` uses `$push`. The 50-item limit is part of the filter (`checklist.49` must not exist), so two concurrent adds can't pass it.
   - `PATCH /cards/:cardId/checklist/:itemId` `{ text?, done? }` uses `$set` on `checklist.$`.
   - `DELETE /cards/:cardId/checklist/:itemId` uses `$pull`.

   They're member-only, log `card.updated` with `fields: ['checklist']`, broadcast `card:updated`, and return the card. A malformed `itemId` gets 404.

2. **Every card has a `version`.** Every write (update, move, and each checklist operation) does `$inc: { version: 1 }` in the same atomic update and returns the document as stored after it (`returnDocument: 'after'`). `updateCard` became a single `findOneAndUpdate` instead of read, change and save.
3. **The client keeps the highest version.** `putCard` and `replaceCard`, which every response, socket event and move goes through, ignore a copy older than the one held. A board refetch merges through the query's `structuralSharing`, so a slow refetch can't roll back a card that a newer event already updated.

Labels and assignees still use the whole-array `PATCH /cards/:cardId`. On the server they're last-write-wins, which is rare for these fields and easy to see and redo. Versions still keep every client showing the latest saved state.

## Alternatives considered

- **Keep the whole-array `PATCH` for checklists:** no new endpoints, but concurrent ticks get lost.
- **Optimistic concurrency on writes** (send the version and get 409 if it's stale): this protects every field on the server, but each conflict costs a refetch and a retry, and the user sees "someone changed this card" even when the two edits touched different things. We use versions only for **ordering on the client**, not to reject writes.
- **Order by `updatedAt` instead of a counter:** no new field, but Mongoose sets `updatedAt` in the api process before the query is sent, so two requests can get timestamps in a different order from the one the database applied them in. Two writes in the same millisecond tie. A counter incremented by the database has neither problem.
- **Refetch the card after every write:** always correct, but it's an extra request per edit, and the refetch can itself arrive out of order.

## Consequences

- Good: concurrent ticks, adds, renames and deletes never overwrite each other in the database. Each response is the true stored state, and late arrivals can't roll back any open window.
- Bad / tradeoffs: two ways still exist to change a checklist (`PATCH /cards/:cardId` also accepts `checklist`). Labels and assignees are last-write-wins on the server. Each tick returns the whole card.
- Known gap: when an archived card leaves the board view, its version is no longer held. A late, older event that shows it unarchived could bring it back until the next refetch. That needs an archive and a delayed older event at once, which is unlikely.
- Follow-ups:
  - If labels or assignees lose edits in practice, give them per-item endpoints, or reject stale writes using `version`.
  - Lists could get the same `version` if list renames start racing.
