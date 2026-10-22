import express from 'express';
import { getDbStatus } from './db/mongoose.js';

export function createApp() {
  const app = express();

  app.get('/health', (_req, res) => {
    const db = getDbStatus();
    const healthy = db === 'connected';
    res.status(healthy ? 200 : 503).json({ status: healthy ? 'ok' : 'degraded', db });
  });

  return app;
}
