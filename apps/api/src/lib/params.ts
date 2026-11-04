import { objectIdSchema } from '@taskboard/shared';
import { NotFound } from './errors.js';

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

/**
 * A route param that must be an ObjectId. A malformed one can't name anything that exists,
 * so it gets the same 404 as a missing record (and never reaches Mongoose as a cast error).
 */
export function requireObjectIdParam(
  params: Params,
  name: string,
  notFoundMessage: string,
): string {
  const parsed = objectIdSchema.safeParse(requireParam(params, name));
  if (!parsed.success) throw new NotFound(notFoundMessage);
  return parsed.data;
}
