import { pino } from 'pino';
import { env } from '../config/env.js';

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.cookie',
      'req.headers.authorization',
      'res.headers["set-cookie"]',
      '*.password',
      '*.token',
    ],
    censor: '[redacted]',
  },
  transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
});
