import { describe, expect, it } from 'vitest';
import { createMessageLimiter } from './rate-limit.js';

describe('createMessageLimiter', () => {
  it('allows up to the limit in one window, then refuses', () => {
    const allow = createMessageLimiter({ max: 3, windowMs: 1_000 }, () => 0);
    expect([allow(), allow(), allow(), allow(), allow()]).toEqual([true, true, true, false, false]);
  });

  it('starts counting again in the next window', () => {
    let time = 0;
    const allow = createMessageLimiter({ max: 2, windowMs: 1_000 }, () => time);
    allow();
    allow();
    expect(allow()).toBe(false);

    time = 1_000;
    expect(allow()).toBe(true);
    expect(allow()).toBe(true);
    expect(allow()).toBe(false);
  });
});
