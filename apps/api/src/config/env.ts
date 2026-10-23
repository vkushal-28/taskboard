import { z } from 'zod';

const DEV_CLIENT_URL = 'http://localhost:5173';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    MONGODB_URI: z
      .string()
      .regex(/^mongodb(\+srv)?:\/\//, 'must be a mongodb:// or mongodb+srv:// URI'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    JWT_ACCESS_SECRET: z.string().min(32, 'must be at least 32 characters'),
    CLIENT_URL: z.url().optional(),
  })
  // A localhost default in production would make CORS and the Origin check reject every
  // write from the real site, so production must set CLIENT_URL explicitly.
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && !env.CLIENT_URL) {
      ctx.addIssue({ code: 'custom', path: ['CLIENT_URL'], message: 'is required in production' });
    }
  })
  .transform((env) => ({ ...env, CLIENT_URL: env.CLIENT_URL ?? DEV_CLIENT_URL }));

export type Env = z.infer<typeof envSchema>;

export function parseEnv(raw: NodeJS.ProcessEnv): Env {
  return envSchema.parse(raw);
}

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
    process.exit(1);
  }
  return result.data;
}

export const env = loadEnv();
