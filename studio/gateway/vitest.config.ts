import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    minWorkers: 1,
    maxWorkers: 1,
    globals: true,
    testTimeout: 10000,
    env: { NODE_ENV: 'test', DEMO_MODE: 'true', DEMO_FALLBACK: 'false', LOG_LEVEL: 'error' },
  },
});
