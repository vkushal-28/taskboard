import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDb, disconnectDb } from './db/mongoose.js';
import { logger } from './lib/logger.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

await connectDb(env.MONGODB_URI);

const server = createApp().listen(env.PORT, () => {
  logger.info(`api listening on http://localhost:${env.PORT}`);
});

function shutdown(signal: NodeJS.Signals) {
  logger.info({ signal }, 'shutting down');
  setTimeout(() => {
    logger.error('graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();

  server.close(() => {
    disconnectDb()
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        logger.error({ error }, 'error while closing mongodb');
        process.exit(1);
      });
  });
}

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
