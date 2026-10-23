import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';
import { getDbStatus } from './db/mongoose.js';

// Mock our own status helper rather than mongoose.connection.readyState: overriding the real
// connection's state also breaks the shared test database connection.
vi.mock('./db/mongoose.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./db/mongoose.js')>()),
  getDbStatus: vi.fn(),
}));

describe('GET /health', () => {
  it('returns 200 when the database is connected', async () => {
    vi.mocked(getDbStatus).mockReturnValue('connected');

    const res = await request(createApp()).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'connected' });
  });

  it('returns 503 when the database is disconnected', async () => {
    vi.mocked(getDbStatus).mockReturnValue('disconnected');

    const res = await request(createApp()).get('/health');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'degraded', db: 'disconnected' });
  });
});
