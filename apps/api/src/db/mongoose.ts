import mongoose from 'mongoose';
import { logger } from '../lib/logger.js';

type DbStatus = 'connected' | 'disconnected';

/** Opens the MongoDB connection at startup and logs when it drops or comes back. */
export async function connectDb(uri: string): Promise<void> {
  mongoose.connection.on('disconnected', () => logger.warn('mongodb disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('mongodb reconnected'));
  await mongoose.connect(uri);
  logger.info('mongodb connected');
}

/** Closes the MongoDB connection, for graceful shutdown. */
export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}

/** `connected` or `disconnected`, as reported by GET /health. */
export function getDbStatus(): DbStatus {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected
    ? 'connected'
    : 'disconnected';
}
