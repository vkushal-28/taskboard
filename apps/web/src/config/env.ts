import { z } from 'zod';

const noTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const envSchema = z
  .object({
    // Where REST calls go: a full URL (local dev, Docker) or a path on the web app's own site
    // that a proxy forwards to the api (`/api` on Vercel, ADR 018). No default: a production
    // build without it would silently call localhost.
    VITE_API_URL: z
      .union([z.url(), z.string().regex(/^\/[\w/-]*$/, 'must be a URL or a path like /api')])
      .transform(noTrailingSlash),
    // Where the live connection goes. Vercel's proxy can't carry WebSockets, so in production
    // this is the api's own address. Defaults to VITE_API_URL when that is a full URL.
    VITE_SOCKET_URL: z.url().transform(noTrailingSlash).optional(),
  })
  .transform(({ VITE_API_URL, VITE_SOCKET_URL }, ctx) => {
    const socketUrl = VITE_SOCKET_URL ?? (VITE_API_URL.startsWith('/') ? null : VITE_API_URL);
    if (socketUrl === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['VITE_SOCKET_URL'],
        message: 'is required when VITE_API_URL is a path',
      });
      return z.NEVER;
    }
    return { apiUrl: VITE_API_URL, socketUrl };
  });

type WebEnv = z.output<typeof envSchema>;

export function parseWebEnv(raw: Record<string, unknown>): WebEnv {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid web environment:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

export const env = parseWebEnv(import.meta.env);
