import { defineConfig } from 'vitest/config';

export default defineConfig({
  ssr: { resolve: { conditions: ['source'] } },
  test: {
    globalSetup: ['test/global-setup.ts'],
    setupFiles: ['test/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/server.ts', 'src/scripts/**'],
      reporter: ['text', 'json-summary', 'html'],
    },
    env: {
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb://localhost:27017/taskboard-test',
      JWT_ACCESS_SECRET: 'test-secret-that-is-at-least-32-characters',
    },
  },
});
