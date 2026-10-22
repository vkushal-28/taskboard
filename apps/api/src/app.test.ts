import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';

function stubReadyState(state: mongoose.ConnectionStates) {
  vi.spyOn(mongoose.connection, 'readyState', 'get').mockReturnValue(state);
}

describe('GET /health', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns 200 when the database is connected', async () => {
    stubReadyState(mongoose.ConnectionStates.connected);

    const res = await request(createApp()).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'connected' });
  });

  it('returns 503 when the database is disconnected', async () => {
    stubReadyState(mongoose.ConnectionStates.disconnected);

    const res = await request(createApp()).get('/health');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'degraded', db: 'disconnected' });
  });
});
