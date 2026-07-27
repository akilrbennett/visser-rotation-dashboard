// Playwright config for the dashboard suite.
// Starts the same static server scripts/preview.sh uses, so `npm run test:e2e` is one command.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.mjs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'python3 -m http.server 8080',
    url: 'http://localhost:8080/index.html',
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
  },
});
