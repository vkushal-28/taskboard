# ADR 015: Email-bound invite links, and keeping at least one owner

- **Status:** Accepted
- **Date:** 2026-11-03

## Context

Slice 5.3 lets an owner invite people by email and manage roles. Three things needed a decision:

1. **Who can use an invite link.** Links get forwarded, pasted into chats and left in inboxes.
2. **How the link reaches the invitee.** The plan says to email it through Resend. Without a verified domain, Resend only delivers to the account owner's own address, so the live demo couldn't email real invitees.
3. **The last owner.** Two owners could demote or remove each other at the same moment. A check-then-write ("is there another owner?", then update) lets both pass and leaves a board nobody can manage.

## Decision

1. **The link is a 32-byte random token, stored only as its SHA-256 hash, and bound to the invited email.** `POST /invites/:token/accept` claims the invite in one atomic `findOneAndUpdate` whose filter includes the token hash, the signed-in user's email, `acceptedAt: null`, `revokedAt: null` and `expiresAt > now`. So a token works once, for one person, for 7 days. When the claim fails, the service reads the invite again to say why: not found (404), revoked, used or expired (410), or another account (403).
2. **The owner gets the link too.** Create and resend return it once. The Share dialog shows it with a Copy button, and an email is also sent when `RESEND_API_KEY` is set. Because of decision 1, a copied or forwarded link is useless to anyone but the invitee. The link is never logged; without Resend, the mailer logs only that it skipped an email.
3. **"Another owner exists" is part of the update's own filter**: `members: { $elemMatch: { role: 'owner', userId: { $ne: target } } }`. If two demotions race, the second one's filter no longer matches, and it gets 409 `LAST_OWNER`.

Other rules: an invite grants `member` or `viewer` (owners are promoted afterwards); resending issues a new token, so the old link stops working; revoking keeps the row with `revokedAt` set, so the old link says "revoked" instead of "not valid". Invites live in their own collection, because accepting looks a token up across every board. Inviting an email again retires its expired invites. Create and resend share a limit of 20 per user per 15 minutes, so Resend can't be used to flood an inbox from our sender. An invite stays valid if the owner who sent it is later demoted or removed: it was a decision of the board, not of that person (most apps behave the same way). Invite changes are logged but not broadcast, because the board room includes viewers and the pending list holds email addresses.

## Alternatives considered

- **Anyone with the link can join**: simpler, but a forwarded link grants access, and the owner can't tell who will show up.
- **Email only, no copyable link**: matches the plan, but the demo can't reach real invitees without a verified domain, and a typo in the email strands the invite.
- **Storing the token in plain text**: a database leak would hand out working invite links. A hash is one line, the same as the refresh tokens (ADR 004).
- **Checking for another owner first, then updating**: two simultaneous demotions both pass the check.
- **A transaction around the claim and the membership**: we don't use transactions (ADR 006). Claiming first means a crash in between leaves a used invite and no membership, which the owner fixes by inviting again. The reverse order could let one token add two people.

## Consequences

- Good: a leaked link, database row or log line can't be used to join a board. Concurrent accepts and concurrent demotions are safe without transactions.
- Good: the demo works without an email provider.
- Bad: someone who signs up with a different email than the one invited can't use the link; the error names the invited email, and the owner can invite the right one.
- Bad: two simultaneous creates for the same email can both succeed and leave two pending invites. Harmless: either one works, and the owner can revoke one.
- Follow-ups: removing a member and changing a role also update their open sockets (ADR 010). With a multi-instance Socket.IO adapter (Phase 7), `fetchSockets()` returns copies, so that update would need `serverSideEmit`.
