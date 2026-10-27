import { z } from 'zod';

const envSchema = z.object({
  // No default: a production build without it would silently call localhost.
  VITE_API_URL: z.url().transform((url) => url.replace(/\/+$/, '')),
});

function loadEnv() {
  const parsed = envSchema.safeParse(import.meta.env);
  if (!parsed.success) {
    throw new Error(`Invalid web environment:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

export const env = loadEnv();
