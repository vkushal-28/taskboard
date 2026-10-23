import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.js';

const SECRET = 'a-secret-that-is-at-least-32-characters';
const required = { MONGODB_URI: 'mongodb://localhost:27017/taskboard', JWT_ACCESS_SECRET: SECRET };

describe('parseEnv', () => {
  it('applies defaults when only required variables are set', () => {
    expect(parseEnv(required)).toEqual({
      NODE_ENV: 'development',
      PORT: 4000,
      MONGODB_URI: 'mongodb://localhost:27017/taskboard',
      LOG_LEVEL: 'info',
      JWT_ACCESS_SECRET: SECRET,
      CLIENT_URL: 'http://localhost:5173',
    });
  });

  it('coerces PORT from a string', () => {
    expect(
      parseEnv({ ...required, MONGODB_URI: 'mongodb+srv://cluster.example.net/db', PORT: '8080' })
        .PORT,
    ).toBe(8080);
  });

  it('rejects a missing MONGODB_URI', () => {
    expect(() => parseEnv({ JWT_ACCESS_SECRET: SECRET })).toThrow(/MONGODB_URI/);
  });

  it('rejects a non-mongodb URI', () => {
    expect(() => parseEnv({ ...required, MONGODB_URI: 'http://localhost' })).toThrow(/mongodb/);
  });

  it('rejects a JWT secret shorter than 32 characters', () => {
    expect(() => parseEnv({ ...required, JWT_ACCESS_SECRET: 'short' })).toThrow(/32 characters/);
  });

  it('rejects a CLIENT_URL that is not a URL', () => {
    expect(() => parseEnv({ ...required, CLIENT_URL: 'localhost' })).toThrow(/CLIENT_URL/);
  });
});
