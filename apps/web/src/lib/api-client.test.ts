import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { errorResponse, json, noContent, urlOf } from '../test/http';
import { createApiClient } from './api-client';
import { ApiError } from './api-error';

const BASE_URL = 'http://api.test';
const itemSchema = z.object({ id: z.string() });

// Answers each path with the next queued response, and records every call.
function fakeFetch(responses: Record<string, Array<() => Response | Promise<Response>>>) {
  return vi.fn((input: string | URL | Request, _init?: RequestInit) => {
    const path = urlOf(input).replace(BASE_URL, '');
    const next = responses[path]?.shift();
    if (!next) throw new Error(`Unexpected request to ${path}`);
    return Promise.resolve(next());
  });
}

function pathsCalled(fetchMock: ReturnType<typeof fakeFetch>): string[] {
  return fetchMock.mock.calls.map(([input]) => urlOf(input).replace(BASE_URL, ''));
}

describe('createApiClient', () => {
  it('sends cookies and a JSON body, and parses the response with the schema', async () => {
    const fetchMock = fakeFetch({ '/items': [() => json(201, { id: 'a1' })] });
    const api = createApiClient({ baseUrl: BASE_URL, fetch: fetchMock });

    const item = await api.request('/items', {
      method: 'POST',
      body: { title: 'x' },
      schema: itemSchema,
    });

    expect(item).toEqual({ id: 'a1' });
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init).toMatchObject({
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: '{"title":"x"}',
    });
  });

  it('throws an ApiError with the server code and message', async () => {
    const fetchMock = fakeFetch({ '/items': [() => errorResponse(409, 'CONFLICT', 'Taken')] });
    const api = createApiClient({ baseUrl: BASE_URL, fetch: fetchMock });

    await expect(api.request('/items')).rejects.toMatchObject({
      status: 409,
      code: 'CONFLICT',
      message: 'Taken',
    });
  });

  it('wraps a non-JSON error body in an ApiError', async () => {
    const fetchMock = fakeFetch({ '/items': [() => new Response('<html>', { status: 502 })] });
    const api = createApiClient({ baseUrl: BASE_URL, fetch: fetchMock });

    const error: unknown = await api.request('/items').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 502, code: 'UNKNOWN' });
  });

  it('refreshes once on a 401 and retries the original request', async () => {
    const fetchMock = fakeFetch({
      '/items': [() => errorResponse(401, 'UNAUTHORIZED'), () => json(200, { id: 'a1' })],
      '/auth/refresh': [noContent],
    });
    const api = createApiClient({ baseUrl: BASE_URL, fetch: fetchMock });

    await expect(api.request('/items', { schema: itemSchema })).resolves.toEqual({ id: 'a1' });
    expect(pathsCalled(fetchMock)).toEqual(['/items', '/auth/refresh', '/items']);
  });

  it('shares one refresh between parallel 401s', async () => {
    let finishRefresh: (response: Response) => void = () => {};
    const refreshDone = new Promise<Response>((resolve) => (finishRefresh = resolve));
    const fetchMock = fakeFetch({
      '/a': [() => errorResponse(401, 'UNAUTHORIZED'), () => json(200, { id: 'a' })],
      '/b': [() => errorResponse(401, 'UNAUTHORIZED'), () => json(200, { id: 'b' })],
      '/auth/refresh': [() => refreshDone],
    });
    const api = createApiClient({ baseUrl: BASE_URL, fetch: fetchMock });

    const both = Promise.all([
      api.request('/a', { schema: itemSchema }),
      api.request('/b', { schema: itemSchema }),
    ]);
    await vi.waitFor(() => expect(pathsCalled(fetchMock)).toContain('/auth/refresh'));
    finishRefresh(noContent());

    await expect(both).resolves.toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(pathsCalled(fetchMock).filter((path) => path === '/auth/refresh')).toHaveLength(1);
  });

  it('retries without logging out when another tab already rotated the token', async () => {
    const onSessionExpired = vi.fn();
    const fetchMock = fakeFetch({
      '/items': [() => errorResponse(401, 'UNAUTHORIZED'), () => json(200, { id: 'a1' })],
      '/auth/refresh': [() => errorResponse(401, 'REFRESH_TOKEN_ROTATED')],
    });
    const api = createApiClient({ baseUrl: BASE_URL, fetch: fetchMock, onSessionExpired });

    await expect(api.request('/items', { schema: itemSchema })).resolves.toEqual({ id: 'a1' });
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('reports an expired session when the refresh fails', async () => {
    const onSessionExpired = vi.fn();
    const fetchMock = fakeFetch({
      '/items': [() => errorResponse(401, 'UNAUTHORIZED')],
      '/auth/refresh': [() => errorResponse(401, 'UNAUTHORIZED', 'Invalid refresh token')],
    });
    const api = createApiClient({ baseUrl: BASE_URL, fetch: fetchMock, onSessionExpired });

    await expect(api.request('/items')).rejects.toMatchObject({ status: 401 });
    expect(onSessionExpired).toHaveBeenCalledOnce();
    expect(pathsCalled(fetchMock)).toEqual(['/items', '/auth/refresh']);
  });

  it('reports an expired session when the retry after a refresh is still a 401', async () => {
    const onSessionExpired = vi.fn();
    const fetchMock = fakeFetch({
      '/items': [
        () => errorResponse(401, 'UNAUTHORIZED'),
        () => errorResponse(401, 'UNAUTHORIZED'),
      ],
      '/auth/refresh': [noContent],
    });
    const api = createApiClient({ baseUrl: BASE_URL, fetch: fetchMock, onSessionExpired });

    await expect(api.request('/items')).rejects.toMatchObject({ status: 401 });
    expect(onSessionExpired).toHaveBeenCalledOnce();
    expect(pathsCalled(fetchMock)).toEqual(['/items', '/auth/refresh', '/items']);
  });

  it.each(['/auth/login', '/auth/register'])('does not refresh on a 401 from %s', async (path) => {
    const onSessionExpired = vi.fn();
    const fetchMock = fakeFetch({ [path]: [() => errorResponse(401, 'UNAUTHORIZED')] });
    const api = createApiClient({ baseUrl: BASE_URL, fetch: fetchMock, onSessionExpired });

    await expect(api.request(path, { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 401,
    });
    expect(pathsCalled(fetchMock)).toEqual([path]);
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('starts a new refresh after the previous one finished', async () => {
    const fetchMock = fakeFetch({
      '/items': [
        () => errorResponse(401, 'UNAUTHORIZED'),
        () => json(200, { id: 'a' }),
        () => errorResponse(401, 'UNAUTHORIZED'),
        () => json(200, { id: 'b' }),
      ],
      '/auth/refresh': [noContent, noContent],
    });
    const api = createApiClient({ baseUrl: BASE_URL, fetch: fetchMock });

    await api.request('/items', { schema: itemSchema });
    await api.request('/items', { schema: itemSchema });

    expect(pathsCalled(fetchMock).filter((path) => path === '/auth/refresh')).toHaveLength(2);
  });
});
