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
