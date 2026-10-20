import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    // Keep local Docker/WSL development usable on memory-constrained machines.
    minWorkers: 1,
    maxWorkers: 1,
    include: ['src/**/*.test.{ts,tsx}'],
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
