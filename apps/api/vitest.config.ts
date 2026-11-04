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
      // Below today's numbers (98% lines, 88% branches) on purpose: a guard against untested
      // code creeping in, not a target. CI fails the run if any of these drops.
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 80 },
    },
    env: {
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb://localhost:27017/taskboard-test',
      JWT_ACCESS_SECRET: 'test-secret-that-is-at-least-32-characters',
    },
  },
});
