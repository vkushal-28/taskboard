import { defineConfig, devices } from '@playwright/test';

// Its own ports and database, so a run never touches the dev data or a `pnpm dev` on 4000/5173.
export const API_URL = 'http://localhost:4100';
const WEB_URL = 'http://localhost:5174';

// Set on the process, so they win over the root .env for both Node and Vite. The secret is
// e2e-only, which keeps the suite independent of a local .env (CI has none).
const serverEnv = {
  NODE_ENV: 'development',
  LOG_LEVEL: 'warn',
  PORT: '4100',
  MONGODB_URI: process.env.E2E_MONGODB_URI ?? 'mongodb://localhost:27017/taskboard-e2e',
  CLIENT_URL: WEB_URL,
  JWT_ACCESS_SECRET: 'e2e-only-secret-that-is-at-least-32-characters',
  VITE_API_URL: API_URL,
};

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // Not the api's `dev` script: no file watching, and no .env file.
      command: 'pnpm --filter @taskboard/api exec tsx --conditions=source src/server.ts',
      url: `${API_URL}/health`,
      env: serverEnv,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'pnpm --filter @taskboard/web exec vite --port 5174 --strictPort',
      url: WEB_URL,
      env: serverEnv,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});

export { serverEnv };
