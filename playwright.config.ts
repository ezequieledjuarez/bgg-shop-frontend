import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  timeout: 60_000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'results/playwright-report.json' }]],
  use: {
    // storageState will be created by the global setup script
    storageState: 'tests/e2e/storageState.json',
    baseURL: process.env.VITE_API_BASE_URL ? process.env.VITE_API_BASE_URL.replace('/api/v1', '') : 'http://localhost:3000',
    headless: true,
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
    actionTimeout: 15000,
    navigationTimeout: 30000,
    // store artifacts under results/
    outputDir: 'results/playwright-artifacts',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
})
