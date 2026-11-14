import { defineConfig, devices } from '@playwright/test';
import { devPort } from './devPort.ts';

const port = devPort();

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results/artifacts',
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${port}`,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm dev',
    port,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
