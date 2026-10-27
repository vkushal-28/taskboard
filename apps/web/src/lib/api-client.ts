import type { z } from 'zod';
import { toApiError } from './api-error';

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  signal?: AbortSignal;
}

export interface ApiClientOptions {
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
  onSessionExpired?: () => void;
}

export interface ApiClient {
  request<T>(path: string, options: RequestOptions & { schema: z.ZodType<T> }): Promise<T>;
  request(path: string, options?: RequestOptions): Promise<void>;
}

const REFRESH_PATH = '/auth/refresh';

// A 401 from these means "bad credentials" or "no session", never "access token expired".
const PATHS_WITHOUT_REFRESH = new Set(['/auth/login', '/auth/register', REFRESH_PATH]);

export function createApiClient({
  baseUrl,
  // Looked up per call, not bound at import, so test stubs of globalThis.fetch take effect.
  fetch: fetchImpl = (input, init) => globalThis.fetch(input, init),
  onSessionExpired,
}: ApiClientOptions): ApiClient {
  let refreshInFlight: Promise<boolean> | null = null;

  function send(path: string, { method = 'GET', body, signal }: RequestOptions): Promise<Response> {
    return fetchImpl(`${baseUrl}${path}`, {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  }

  // Single-flight: every 401 that arrives while a refresh is running waits for that same refresh.
  // Two parallel refreshes would rotate the token twice and the second would look like reuse.
  function refreshSession(): Promise<boolean> {
    refreshInFlight ??= send(REFRESH_PATH, { method: 'POST' })
      .then(async (response) => {
        if (response.ok) return true;
        // Another tab rotated the cookie a moment ago; the browser already holds the new one.
        const error = await toApiError(response);
        return error.code === 'REFRESH_TOKEN_ROTATED';
      })
      .finally(() => {
        refreshInFlight = null;
      });
    return refreshInFlight;
  }

  function request<T>(path: string, options: RequestOptions & { schema: z.ZodType<T> }): Promise<T>;
  function request(path: string, options?: RequestOptions): Promise<void>;
  async function request<T>(
    path: string,
    options: RequestOptions & { schema?: z.ZodType<T> } = {},
  ): Promise<T | void> {
    let response = await send(path, options);

    if (response.status === 401 && !PATHS_WITHOUT_REFRESH.has(path)) {
      if (await refreshSession()) response = await send(path, options);
      if (response.status === 401) onSessionExpired?.();
    }

    if (!response.ok) throw await toApiError(response);
    if (!options.schema) return;
    return options.schema.parse(await response.json());
  }

  return { request };
}
