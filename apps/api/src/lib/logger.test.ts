import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { loggerOptions } from './logger.js';

function logOnce(object: object): string {
  let output = '';
  const destination = { write: (line: string) => (output += line) };
  pino({ ...loggerOptions, level: 'info' }, destination).info(object, 'test');
  return output;
}

describe('logger redaction', () => {
  it.each([
    ['top-level password', { password: 'hunter2' }],
    ['top-level token', { token: 'hunter2' }],
    ['nested password', { user: { password: 'hunter2' } }],
    ['nested token', { session: { token: 'hunter2' } }],
    ['request body password', { req: { body: { password: 'hunter2' } } }],
    ['cookie header', { req: { headers: { cookie: 'hunter2' } } }],
    ['authorization header', { req: { headers: { authorization: 'Bearer hunter2' } } }],
    ['set-cookie header', { res: { headers: { 'set-cookie': 'hunter2' } } }],
  ])('redacts %s', (_name, object) => {
    const output = logOnce(object);

    expect(output).not.toContain('hunter2');
    expect(output).toContain('[redacted]');
  });

  it('keeps non-sensitive fields', () => {
    expect(logOnce({ user: { email: 'priya@acme.dev' } })).toContain('priya@acme.dev');
  });
});
