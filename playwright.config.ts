import {defineConfig, devices} from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:8081',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm playground',
    url: 'http://127.0.0.1:8081',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    {name: 'chromium', use: {...devices['Desktop Chrome']}},
    {name: 'firefox', use: {...devices['Desktop Firefox']}},
    {name: 'webkit', use: {...devices['Desktop Safari']}},
  ],
});
