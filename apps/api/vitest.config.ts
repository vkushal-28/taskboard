import { defineConfig } from 'vitest/config';

export default defineConfig({
  ssr: { resolve: { conditions: ['source'] } },
  test: {
    env: { NODE_ENV: 'test', MONGODB_URI: 'mongodb://localhost:27017/taskboard-test' },
  },
});
