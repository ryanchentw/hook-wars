import { defineConfig, devices } from '@playwright/test';
import { devPort, serverPort } from './devPort.ts';

const port = devPort();
const gamePort = serverPort();

/** A countdown long enough for two pages drawing WebGL in software to get their scenes up, and no longer. */
const COUNTDOWN_MS = 1500;
/** Every test here creates rooms from one address; the default allowance is sized for a household, not a test run. */
const JOINS_PER_MINUTE = 600;

/**
 * The online specs: the same dev server as the offline ones, plus the game server it passes `/ws` on to.
 * The offline specs in `e2e/` have their own config and run with no game server at all.
 */
export default defineConfig({
  testDir: './e2e-online',
  outputDir: './test-results/artifacts-online',
  timeout: 120_000,
  // Each test is two pages of software WebGL and one shared server: one at a time keeps their clocks honest.
  workers: 1,
  use: { baseURL: `http://localhost:${port}` },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    { command: 'pnpm dev', port, reuseExistingServer: true, timeout: 60_000, env: { HOOKBRAWL_SERVER_PORT: String(gamePort) } },
    {
      command: 'pnpm --filter @hookbrawl/server serve',
      port: gamePort,
      reuseExistingServer: true,
      timeout: 60_000,
      env: {
        HOOKBRAWL_SERVER_PORT: String(gamePort),
        HOOKBRAWL_MATCH_COUNTDOWN_MS: String(COUNTDOWN_MS),
        HOOKBRAWL_JOINS_PER_MINUTE: String(JOINS_PER_MINUTE),
        HOOKBRAWL_LOG_LEVEL: 'warn',
      },
    },
  ],
});
