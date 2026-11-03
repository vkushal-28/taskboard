export interface MessageLimit {
  /** Messages allowed per window. */
  max: number;
  windowMs: number;
}

/** Enough for real use (a drag sends two messages) with a wide margin. */
export const SOCKET_MESSAGE_LIMIT: MessageLimit = { max: 20, windowMs: 1_000 };

/**
 * A fixed-window counter for one socket. Returns true while the socket is within its limit.
 * REST has express-rate-limit; this is the socket equivalent, so one client can't flood a
 * room with drag cues or hit the database with repeated joins.
 */
export function createMessageLimiter(
  { max, windowMs }: MessageLimit,
  now: () => number = Date.now,
): () => boolean {
  let windowStart = now();
  let count = 0;
  return () => {
    const time = now();
    if (time - windowStart >= windowMs) {
      windowStart = time;
      count = 0;
    }
    count += 1;
    return count <= max;
  };
}
