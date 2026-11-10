// Seeds the demo accounts and board: `pnpm --filter @taskboard/api seed`.
import { env } from '../config/env.js';
import { connectDb, disconnectDb } from '../db/mongoose.js';
import { logger } from '../lib/logger.js';
import { DEMO_USERS, seedDemo } from '../modules/demo/seed.js';

try {
  await connectDb(env.MONGODB_URI);
  const result = await seedDemo();
  logger.info(
    { boards: result.boards },
    `demo ready: sign in as ${DEMO_USERS.priya.email} or ${DEMO_USERS.alex.email}`,
  );
} catch (err) {
  logger.fatal({ err }, 'seed failed');
  process.exitCode = 1;
} finally {
  await disconnectDb();
}
