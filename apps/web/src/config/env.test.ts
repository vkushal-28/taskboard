import { describe, expect, it } from 'vitest';
import { parseWebEnv } from './env';

describe('parseWebEnv', () => {
  it('uses one full URL for REST and the socket in development', () => {
    expect(parseWebEnv({ VITE_API_URL: 'http://localhost:4000/' })).toEqual({
      apiUrl: 'http://localhost:4000',
      socketUrl: 'http://localhost:4000',
    });
  });

  it('sends REST through the proxy path and the socket to the api directly', () => {
    expect(
      parseWebEnv({
        VITE_API_URL: '/api',
        VITE_SOCKET_URL: 'https://taskboard-api.onrender.com/',
      }),
    ).toEqual({ apiUrl: '/api', socketUrl: 'https://taskboard-api.onrender.com' });
  });

  it('requires a socket URL when REST goes through a path', () => {
    expect(() => parseWebEnv({ VITE_API_URL: '/api' })).toThrow(/VITE_SOCKET_URL/);
  });

  it.each([undefined, 'api', 'not a url'])('rejects VITE_API_URL %s', (value) => {
    expect(() => parseWebEnv({ VITE_API_URL: value })).toThrow(/VITE_API_URL/);
  });
});
