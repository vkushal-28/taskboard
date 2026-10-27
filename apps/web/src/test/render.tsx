import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import { routes } from '../app/routes';
import { queryClient } from '../lib/query-client';
import { json, urlOf } from './http';

export type FakeRoute = (init: RequestInit | undefined) => Response | Promise<Response>;

// Stubs fetch with one handler per "METHOD /path". Unknown requests fail the test loudly.
export function stubApi(handlers: Record<string, FakeRoute>) {
  const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(urlOf(input));
    const key = `${init?.method ?? 'GET'} ${url.pathname}`;
    const handler = handlers[key];
    if (!handler) return Promise.reject(new Error(`Unhandled request: ${key}`));
    return Promise.resolve(handler(init));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

// Uses the app's real query client because lib/api.ts writes session expiry into it.
export function renderApp(initialPath: string) {
  queryClient.clear();
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router };
}

// What the home page loads besides /auth/me. Spread into stubApi() for tests that land there.
export const emptyHomeHandlers: Record<string, FakeRoute> = {
  'GET /boards': () => json(200, { boards: [] }),
  'GET /activity/recent': () => json(200, { activity: [] }),
};
