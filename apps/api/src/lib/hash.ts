import { createHash } from 'node:crypto';

/**
 * The stored form of a secret token (refresh token, socket ticket, invite link). These are 32
 * random bytes, so a fast unsalted hash is enough: there is nothing to guess.
 */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
