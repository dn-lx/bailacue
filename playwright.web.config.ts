import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/web-e2e',
  timeout: 30000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://127.0.0.1:4174',
    trace: 'retain-on-failure',
    screenshot: 'on',
  },
  projects: [
    { name: 'phone-320', use: { ...devices['Pixel 7'], viewport: { width: 320, height: 740 } } },
    { name: 'phone-390', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
    { name: 'tablet-768', use: { ...devices['iPad Mini'], browserName: 'chromium' } },
  ],
  webServer: {
    command: 'python3 -m http.server 4174 --bind 127.0.0.1 --directory web/dist',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
  reporter: [['list'], ['html', { outputFolder: 'artifacts/web-playwright-report', open: 'never' }]],
  outputDir: 'artifacts/web-playwright-results',
});
