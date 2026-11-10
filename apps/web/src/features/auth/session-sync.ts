import type { PublicUser } from '@taskboard/shared';
import type { QueryClient } from '@tanstack/react-query';
import { authKeys, clearSession } from './keys';

// Every tab of this browser shares the auth cookies, so signing in or out in one tab changes
// the session of all of them. Board pages also learn about a sign-out from their socket
// (ADR 016); this channel covers every page, sockets or not.
export const SESSION_CHANNEL_NAME = 'taskboard:session';

interface SessionMessage {
  /** Who is signed in now, or null after a sign-out or an expired session. */
  userId: string | null;
}

// One channel per tab for sending and receiving: a BroadcastChannel never receives its own
// messages, so a tab doesn't react to its own announcement.
let channel: BroadcastChannel | null | undefined;

function getChannel(): BroadcastChannel | null {
  if (channel === undefined) {
    channel =
      typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(SESSION_CHANNEL_NAME);
  }
  return channel;
}

function isSessionMessage(data: unknown): data is SessionMessage {
  if (typeof data !== 'object' || data === null || !('userId' in data)) return false;
  return typeof data.userId === 'string' || data.userId === null;
}

/** Tells this browser's other tabs who is signed in now. */
export function announceSession(userId: string | null): void {
  getChannel()?.postMessage({ userId } satisfies SessionMessage);
}

/**
 * Applies other tabs' sign-ins and sign-outs to this tab. Returns the unsubscribe function,
 * so it can be an effect's cleanup.
 */
export function syncSessionAcrossTabs(queryClient: QueryClient): () => void {
  const current = getChannel();
  if (!current) return () => {};

  function onMessage(event: MessageEvent<unknown>) {
    if (!isSessionMessage(event.data)) return;
    const shownUser = queryClient.getQueryData<PublicUser | null>(authKeys.me);
    if ((shownUser?.id ?? null) === event.data.userId) return;
    // Signed out, or someone else signed in: drop everything this tab knows about the old
    // user. For a sign-in, refetching /auth/me then picks up the new user from the cookies.
    clearSession(queryClient);
    if (event.data.userId !== null) void queryClient.invalidateQueries({ queryKey: authKeys.me });
  }

  current.addEventListener('message', onMessage);
  return () => current.removeEventListener('message', onMessage);
}
