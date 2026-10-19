import {defineConfig, devices} from '@playwright/test';

const chromiumExecutablePath = (
  globalThis as typeof globalThis & {
    process?: {env?: Record<string, string | undefined>};
  }
).process?.env?.['PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH'];

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:8081',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'pnpm playground',
      url: 'http://127.0.0.1:8081',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'HOST=127.0.0.1 PORT=12345 GC=false pnpm exec y-websocket-server',
      url: 'http://127.0.0.1:12345',
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(chromiumExecutablePath
          ? {launchOptions: {executablePath: chromiumExecutablePath}}
          : {}),
      },
    },
    {name: 'firefox', use: {...devices['Desktop Firefox']}},
    {name: 'webkit', use: {...devices['Desktop Safari']}},
  ],
});
