import type { RequestHandler } from 'express';
import { z } from 'zod';
import { ValidationError } from '../lib/errors.js';

// validateBody() runs before these handlers, so the body type is guaranteed by the route.
export type WithBody<Body> = RequestHandler<Record<string, string>, unknown, Body>;

export function validateBody(schema: z.ZodType): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(new ValidationError(z.flattenError(result.error)));
      return;
    }
    req.body = result.data;
    next();
  };
}

// Express 5 makes req.query a read-only getter, so query strings are parsed in the controller
// instead of being replaced by middleware.
export function parseQuery<T>(schema: z.ZodType<T>, query: unknown): T {
  const result = schema.safeParse(query);
  if (!result.success) throw new ValidationError(z.flattenError(result.error));
  return result.data;
}
