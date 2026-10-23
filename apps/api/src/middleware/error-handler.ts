import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError, NotFound } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new NotFound(`Route ${req.method} ${req.path} not found`));
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  // body-parser errors (malformed JSON, payload too large) carry an HTTP status. Only messages
  // marked `expose` are safe to show; other libraries may put internals in theirs.
  if (isHttpClientError(err)) {
    const message = err.expose === true ? err.message : 'Bad request';
    res.status(err.status).json({ error: { code: 'BAD_REQUEST', message } });
    return;
  }

  logger.error({ err, method: req.method, path: req.path }, 'unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
};

function isHttpClientError(
  err: unknown,
): err is { status: number; message: string; expose?: unknown } {
  if (typeof err !== 'object' || err === null || !('status' in err)) return false;
  const { status } = err;
  return typeof status === 'number' && status >= 400 && status < 500;
}
