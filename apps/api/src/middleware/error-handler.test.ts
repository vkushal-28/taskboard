import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorOf } from '../../test/factories.js';
import { createApp } from '../app.js';
import { Conflict } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { errorHandler } from './error-handler.js';

function appThatThrows(err: unknown) {
  return express()
    .get('/boom', () => {
      throw err;
    })
    .use(errorHandler);
}

describe('errorHandler', () => {
  afterEach(() => vi.restoreAllMocks());

  it('formats an AppError with its status and code', async () => {
    const res = await request(appThatThrows(new Conflict('Already taken'))).get('/boom');

    expect(res.status).toBe(409);
    expect(errorOf(res)).toEqual({ code: 'CONFLICT', message: 'Already taken' });
  });

  it('returns a generic 500 for unknown errors and logs the original', async () => {
    const logError = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    const err = new Error('connection string mongodb://admin:secret@db');

    const res = await request(appThatThrows(err)).get('/boom');

    expect(res.status).toBe(500);
    expect(errorOf(res)).toEqual({ code: 'INTERNAL', message: 'Something went wrong' });
    expect(JSON.stringify(res.body)).not.toContain('secret');
    expect(logError).toHaveBeenCalledWith(expect.objectContaining({ err }), 'unhandled error');
  });

  it('hides the message of a 4xx error that is not marked expose', async () => {
    const err = Object.assign(new Error('internal detail'), { status: 400 });

    const res = await request(appThatThrows(err)).get('/boom');

    expect(res.status).toBe(400);
    expect(errorOf(res)).toEqual({ code: 'BAD_REQUEST', message: 'Bad request' });
  });

  it('returns 400 for malformed JSON', async () => {
    const res = await request(createApp())
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send('{bad');

    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe('BAD_REQUEST');
  });

  it('returns 404 for an unknown route', async () => {
    const res = await request(createApp()).get('/does-not-exist');

    expect(res.status).toBe(404);
    expect(errorOf(res)).toEqual({
      code: 'NOT_FOUND',
      message: 'Route GET /does-not-exist not found',
    });
  });
});
