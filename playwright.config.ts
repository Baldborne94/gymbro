import { defineConfig, devices } from '@playwright/test';

const PORT = 4321;

export default defineConfig({
  testDir: 'tests/e2e',
  // Un solo server condiviso: i test girano in fila per non pestarsi i piedi.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    ...devices['Pixel 7'],
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: 'it-IT',
    timezoneId: 'Europe/Rome',
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node tests/e2e/serve.mjs',
    url: `http://127.0.0.1:${PORT}/api/health`,
    env: { E2E_PORT: String(PORT) },
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'pipe',
  },
});
