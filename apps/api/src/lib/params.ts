type Params = Record<string, string | string[] | undefined>;

// Express 5 types params as string | string[] because wildcard params are arrays.
export function stringParam(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** A named route param; throws if the route does not declare it (a programming error). */
export function requireParam(params: Params, name: string): string {
  const value = stringParam(params[name]);
  if (value === undefined) throw new Error(`Route is missing the :${name} param`);
  return value;
}
