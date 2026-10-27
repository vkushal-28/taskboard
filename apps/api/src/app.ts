import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { getDbStatus } from './db/mongoose.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { requireSameOrigin } from './middleware/require-same-origin.js';
import { createActivityRouter } from './modules/activity/routes.js';
import { createAuthRouter } from './modules/auth/routes.js';
import { createBoardsRouter } from './modules/boards/routes.js';
import { createCardsRouter } from './modules/cards/routes.js';
import { createListsRouter } from './modules/lists/routes.js';

export function createApp() {
  const app = express();
  const clientOrigin = new URL(env.CLIENT_URL).origin;

  app.use(helmet());
  app.use(cors({ origin: clientOrigin, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(requireSameOrigin(clientOrigin));

  app.get('/health', (_req, res) => {
    const db = getDbStatus();
    const healthy = db === 'connected';
    res.status(healthy ? 200 : 503).json({ status: healthy ? 'ok' : 'degraded', db });
  });

  app.use('/auth', createAuthRouter());
  app.use('/activity', createActivityRouter());
  app.use('/boards', createBoardsRouter());
  app.use(createListsRouter());
  app.use(createCardsRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
