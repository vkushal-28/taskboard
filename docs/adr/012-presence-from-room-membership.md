# ADR 012: Presence comes from board-room membership, per user

- **Status:** Accepted
- **Date:** 2026-11-03

## Context

Slice 4.3 shows who is on a board ("2 online", with avatars) and which card someone is dragging. Both are short-lived: they are true only while a socket is open, and nothing about them is worth saving. They must clear when a tab closes, including mid-drag, or the board shows ghosts.

Taskboard runs one api instance on Render today. More instances are possible later, and Socket.IO then needs a shared adapter (Redis) so that a room spans all instances.

## Decision

1. **No separate presence store.** The online list is read from the board room itself: `io.in(room).fetchSockets()`, deduplicated by `socket.data.userId`. It is broadcast as `presence:update { boardId, userIds }` after every join, leave and disconnect. Presence can't drift from who receives the board's events, because it is that same list.
2. **Per user, not per socket.** Two tabs count as one person. When one of them closes, the user stays online.
3. **Ids only.** The client already has every member's name in the cached board, so the server never looks up names.
4. **Drag cues are relayed, never saved.** `card:drag` is accepted only from a socket that joined the board as member or owner and is still in its room. It goes to the room except the sender. The socket remembers its current drag, so a disconnect sends `cardId: null`.
5. **`socket.data` holds plain objects** (joined boards with their role, and the current drag), not Maps, because a multi-instance adapter serializes it.

## Alternatives considered

- **A presence map in memory** (board → user → socket ids). It answers without async work, but it is a second copy of what the room already knows, it has to be cleaned up by hand on every leave, disconnect and board delete, and it is wrong as soon as there are two instances.
- **Presence in Redis or MongoDB with heartbeats.** It survives restarts and works across instances, but it is a new dependency or constant writes, for data that is only meaningful while a socket is open.
- **Per-socket presence.** It is simpler to count, but "Priya, Priya" for two tabs is wrong, and closing one tab would look like leaving.

## Consequences

- Good: little code and nothing to keep in sync, with no new dependency. Closing a tab clears presence and any drag. With the Socket.IO Redis adapter, `fetchSockets()` and room broadcasts already span instances, so presence keeps working when we scale out.
- Bad / tradeoffs: every join, leave and disconnect runs `fetchSockets()` and sends the full list, which costs O(sockets in the room). That's fine at Kanban-board scale but not for thousands of viewers per board. A drag cue is only start and end, not the live position.
- Follow-ups:
  - Phase 7: if Render runs more than one instance, add `@socket.io/redis-adapter`.
  - Phase 5: a member removed from a board must also leave its room (ADR 010), and that leave should broadcast presence.
