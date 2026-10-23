import { pino, type LoggerOptions } from 'pino';
import { env } from '../config/env.js';

export const loggerOptions = {
  redact: {
    paths: [
      'password',
      'passwordHash',
      'token',
      'accessToken',
      'refreshToken',
      '*.password',
      '*.passwordHash',
      '*.token',
      '*.accessToken',
      '*.refreshToken',
      'req.body.password',
      'req.cookies',
      'req.headers.cookie',
      'req.headers.authorization',
      'res.headers["set-cookie"]',
    ],
    censor: '[redacted]',
  },
} satisfies LoggerOptions;

export const logger = pino({
  ...loggerOptions,
  level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
  transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
});
