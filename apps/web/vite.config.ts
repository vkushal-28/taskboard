import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defaultClientConditions } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { conditions: ['source', ...defaultClientConditions] },
  // One .env at the repo root for api and web. Vite only exposes VITE_* keys to the client.
  envDir: '../..',
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    env: { VITE_API_URL: 'http://api.test' },
  },
});
