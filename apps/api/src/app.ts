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
import { createCommentsRouter } from './modules/comments/routes.js';
import { createInvitesRouter } from './modules/invites/routes.js';
import { createListsRouter } from './modules/lists/routes.js';
import { createMembersRouter } from './modules/members/routes.js';
import { createRealtimeRouter } from './modules/realtime/routes.js';

interface AppOptions {
  trustProxy?: number;
  /** The deployed commit, or null outside Render. */
  commit?: string | null;
}

export function createApp({
  trustProxy = env.TRUST_PROXY,
  commit = env.RENDER_GIT_COMMIT ?? null,
}: AppOptions = {}) {
  const app = express();
  const clientOrigin = new URL(env.CLIENT_URL).origin;

  // Behind Render (and the Vercel proxy) every request comes from a proxy. Trusting exactly
  // that many hops makes req.ip the client's address, which the rate limits key on.
  app.set('trust proxy', trustProxy);

  app.use(helmet());
  // Every response is per-user or live data. In production the api is reached through
  // Vercel's proxy, which caches what an origin allows (ADR 018); no-store forbids that.
  app.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use(cors({ origin: clientOrigin, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(requireSameOrigin(clientOrigin));

  app.get('/health', (_req, res) => {
    const db = getDbStatus();
    const healthy = db === 'connected';
    res.status(healthy ? 200 : 503).json({ status: healthy ? 'ok' : 'degraded', db, commit });
  });

  app.use('/auth', createAuthRouter());
  app.use('/boards', createBoardsRouter());
  app.use(createListsRouter());
  app.use(createCardsRouter());
  app.use(createCommentsRouter());
  app.use(createActivityRouter());
  app.use(createMembersRouter());
  app.use(createInvitesRouter());
  app.use(createRealtimeRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
