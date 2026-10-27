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
      COOKIE_SECURE: false,
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

  it('requires CLIENT_URL in production', () => {
    expect(() => parseEnv({ ...required, NODE_ENV: 'production' })).toThrow(/CLIENT_URL/);
  });

  it('accepts an explicit CLIENT_URL in production', () => {
    const env = parseEnv({
      ...required,
      NODE_ENV: 'production',
      CLIENT_URL: 'https://app.example.com',
    });
    expect(env.CLIENT_URL).toBe('https://app.example.com');
  });

  it('rejects a CLIENT_URL that is not a URL', () => {
    expect(() => parseEnv({ ...required, CLIENT_URL: 'localhost' })).toThrow(/CLIENT_URL/);
  });

  it.each([
    ['development', undefined, false],
    ['production', undefined, true],
    ['production', 'false', false],
    ['development', 'true', true],
  ])('in %s with COOKIE_SECURE=%s, cookies are secure: %s', (NODE_ENV, COOKIE_SECURE, secure) => {
    const env = parseEnv({
      ...required,
      NODE_ENV,
      CLIENT_URL: 'http://localhost:8080',
      ...(COOKIE_SECURE === undefined ? {} : { COOKIE_SECURE }),
    });
    expect(env.COOKIE_SECURE).toBe(secure);
  });

  it('rejects COOKIE_SECURE=false for an https CLIENT_URL', () => {
    expect(() =>
      parseEnv({
        ...required,
        NODE_ENV: 'production',
        CLIENT_URL: 'https://app.example.com',
        COOKIE_SECURE: 'false',
      }),
    ).toThrow(/COOKIE_SECURE/);
  });

  it('rejects a COOKIE_SECURE that is not a boolean', () => {
    expect(() => parseEnv({ ...required, COOKIE_SECURE: 'sometimes' })).toThrow(/COOKIE_SECURE/);
  });
});
