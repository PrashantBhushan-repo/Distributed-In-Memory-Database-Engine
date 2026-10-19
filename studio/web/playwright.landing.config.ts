import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', testMatch: 'landing.spec.ts', timeout: 30000,
  use: { baseURL: 'http://localhost:3000', trace: 'retain-on-failure', launchOptions: process.env.CI ? {} : { channel: 'chrome' } },
  webServer: { command: 'npm run preview -- --port 3000 --strictPort', port: 3000, reuseExistingServer: !process.env.CI },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }, { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } }],
  reporter: [['list'], ['html', { open: 'never' }]],
});
