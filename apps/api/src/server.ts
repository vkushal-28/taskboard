import type { Server } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDb, disconnectDb } from './db/mongoose.js';
import { listen } from './lib/listen.js';
import { logger } from './lib/logger.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

await connectDb(env.MONGODB_URI);

let server: Server;
try {
  server = await listen(createApp(), env.PORT);
  logger.info(`api listening on http://localhost:${env.PORT}`);
} catch (err) {
  logger.fatal({ err }, 'failed to start http server');
  await disconnectDb();
  process.exit(1);
}

function shutdown(signal: NodeJS.Signals) {
  logger.info({ signal }, 'shutting down');
  setTimeout(() => {
    logger.error('graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();

  server.close(() => {
    disconnectDb()
      .then(() => process.exit(0))
      .catch((err: unknown) => {
        logger.error({ err }, 'error while closing mongodb');
        process.exit(1);
      });
  });
}

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
