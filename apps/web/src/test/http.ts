export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function errorResponse(status: number, code: string, message = 'error'): Response {
  return json(status, { error: { code, message } });
}

export function noContent(): Response {
  return new Response(null, { status: 204 });
}

export function urlOf(input: string | URL | Request): string {
  return input instanceof Request ? input.url : input.toString();
}
