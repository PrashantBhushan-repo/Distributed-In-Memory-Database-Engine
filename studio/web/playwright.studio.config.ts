import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', testMatch: 'studio.spec.ts', timeout: 60000, workers: 1,
  use: { baseURL: process.env.STUDIO_URL || 'http://127.0.0.1:13000', trace: 'retain-on-failure',
    ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1050 },
    launchOptions: process.env.CI ? {} : { channel: 'chrome' } },
  reporter: [['list']],
});
