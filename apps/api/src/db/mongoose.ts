import mongoose from 'mongoose';
import { logger } from '../lib/logger.js';

export type DbStatus = 'connected' | 'disconnected';

export async function connectDb(uri: string): Promise<void> {
  mongoose.connection.on('disconnected', () => logger.warn('mongodb disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('mongodb reconnected'));
  await mongoose.connect(uri);
  logger.info('mongodb connected');
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}

export function getDbStatus(): DbStatus {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected
    ? 'connected'
    : 'disconnected';
}
