import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.js';

describe('parseEnv', () => {
  it('applies defaults when only MONGODB_URI is set', () => {
    expect(parseEnv({ MONGODB_URI: 'mongodb://localhost:27017/taskboard' })).toEqual({
      NODE_ENV: 'development',
      PORT: 4000,
      MONGODB_URI: 'mongodb://localhost:27017/taskboard',
      LOG_LEVEL: 'info',
    });
  });

  it('coerces PORT from a string', () => {
    expect(
      parseEnv({ MONGODB_URI: 'mongodb+srv://cluster.example.net/db', PORT: '8080' }).PORT,
    ).toBe(8080);
  });

  it('rejects a missing MONGODB_URI', () => {
    expect(() => parseEnv({})).toThrow(/MONGODB_URI/);
  });

  it('rejects a non-mongodb URI', () => {
    expect(() => parseEnv({ MONGODB_URI: 'http://localhost' })).toThrow(/mongodb/);
  });
});
