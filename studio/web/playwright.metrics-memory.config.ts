import { defineConfig } from '@playwright/test';
import studio from './playwright.studio.config';

export default defineConfig(studio, {
  testMatch: 'metrics-memory.spec.ts', timeout: 180000, workers: 1,
  outputDir: './test-results-metrics-memory',
  use: { ...studio.use, launchOptions: { ...studio.use?.launchOptions, args: ['--js-flags=--max-old-space-size=128'] } },
});
