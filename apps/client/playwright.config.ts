import { defineConfig, devices } from '@playwright/test';
import { automationStorage } from './automation.ts';
import { devPort } from './devPort.ts';

const port = devPort();

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results/artifacts',
  timeout: 60_000,
  // Every page draws WebGL in software on several threads; more pages than this at once and the matches run in slow motion.
  workers: '33%',
  use: {
    baseURL: `http://localhost:${port}`,
    storageState: automationStorage(`http://localhost:${port}`),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm dev',
    port,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
