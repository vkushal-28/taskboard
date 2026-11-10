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
    // Defaults to on in production. The Docker stack runs production builds over
    // http://localhost, where Safari drops Secure cookies, so it turns this off.
    COOKIE_SECURE: z.stringbool().optional(),
    // The path the browser uses to reach the api, when a proxy serves it under the web app's
    // own address (Vercel forwards /api/* to Render, ADR 018). It scopes the refresh cookie,
    // which the browser only sends to `${API_PUBLIC_PATH}/auth`. Empty when called directly.
    API_PUBLIC_PATH: z
      .string()
      .regex(/^(\/[\w-]+)*$/, 'must be empty or a path like /api, without a trailing slash')
      .default(''),
    // How many proxies sit in front of the api (Express `trust proxy`). With it, rate limits
    // key on the real client IP instead of the proxy's. Too high lets clients fake their IP
    // with X-Forwarded-For, so it must match the actual chain. 0 when nothing is in front.
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
    // Sign-in and register attempts per client IP per 15 minutes. Production keeps the default;
    // the e2e suite raises it, because every test registers its own people from one IP.
    AUTH_RATE_LIMIT: z.coerce.number().int().min(1).default(10),
    // Invite emails go through Resend when both are set; otherwise they are skipped and the
    // owner copies the link from the Share dialog (ADR 015).
    RESEND_API_KEY: z.string().min(1).optional(),
    EMAIL_FROM: z.string().min(3).optional(),
    // Set by Render on every deploy. /health reports it, so the deploy workflow can tell the
    // new version from the old one that keeps answering while Render builds.
    RENDER_GIT_COMMIT: z
      .string()
      .regex(/^[0-9a-f]{7,40}$/, 'must be a git commit SHA')
      .optional(),
  })
  // A localhost default in production would make CORS and the Origin check reject every
  // write from the real site, so production must set CLIENT_URL explicitly.
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && !env.CLIENT_URL) {
      ctx.addIssue({ code: 'custom', path: ['CLIENT_URL'], message: 'is required in production' });
    }
    if ((env.RESEND_API_KEY === undefined) !== (env.EMAIL_FROM === undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: ['EMAIL_FROM'],
        message: 'set RESEND_API_KEY and EMAIL_FROM together',
      });
    }
    // An https site needs Secure cookies; turning them off there is always a mistake.
    if (env.COOKIE_SECURE === false && env.CLIENT_URL?.startsWith('https://')) {
      ctx.addIssue({
        code: 'custom',
        path: ['COOKIE_SECURE'],
        message: 'cannot be false when CLIENT_URL is https',
      });
    }
  })
  .transform((env) => ({
    ...env,
    CLIENT_URL: env.CLIENT_URL ?? DEV_CLIENT_URL,
    COOKIE_SECURE: env.COOKIE_SECURE ?? env.NODE_ENV === 'production',
  }));

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
