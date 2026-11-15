import { expect, test, type Locator, type Page } from '@playwright/test';
import { ECONOMY } from '@hookbrawl/sim';

const SHOT_DIR = 'test-results';
const DESKTOP = { width: 1280, height: 720 };
const LONG_MATCH = 3_000;
const FEED_STEP_SECONDS = 5;
const FEED_TRIES = 120;
/** Summed float time lands a hair either side of a whole second. */
const SLACK = 1e-6;

async function matchUp(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__hookbrawl !== undefined, null, { timeout: 30_000 });
  await expect(page.locator('#stage')).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
}

async function waitForKill(page: Page): Promise<void> {
  const kills = page.locator('.hud-feed li');
  for (let i = 0; i < FEED_TRIES && (await kills.count()) === 0; i += 1) {
    await page.evaluate((s) => window.__hookbrawl!.fastForward(s), FEED_STEP_SECONDS);
  }
  await expect(kills.first()).toBeVisible();
}

type Ledger = { readonly earned: number; readonly derived: number; readonly gold: number | null };

/** Each fighter's earned gold beside what their public kills, assists and the clock say it must be. */
const ledger = (page: Page): Promise<readonly Ledger[]> =>
  page.evaluate(
    ({ economy, slack }) => {
      const view = window.__hookbrawl!.getView();
      const seconds = Math.floor(view.time + slack);
      return view.roster.map((c) => ({
        earned: c.earned,
        derived: economy.startingGold + seconds * economy.passiveGold + c.kills * economy.killGold + c.assists * economy.assistGold,
        gold: view.players.find((p) => p.id === c.id)?.gold ?? null,
      }));
    },
    { economy: ECONOMY, slack: SLACK },
  );

/** The table's Earned column, read in row order, against the view's roster. */
async function expectEarnedColumn(page: Page, table: Locator): Promise<void> {
  await expect(table.getByRole('columnheader', { name: 'Gold earned' })).toBeVisible();
  await expect(table.locator('thead th').last()).toHaveText(/Earned/);
  const rows = await ledger(page);
  rows.forEach((row) => expect(row.earned).toBe(row.derived));
  const cells = table.locator('tbody tr:not(.score-side) td:last-child');
  await expect(cells).toHaveText(rows.map((row) => String(row.earned)));
}

test('the scoreboard and the final table show gold earned, which spending never lowers and fog never hides', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize(DESKTOP);
  await page.goto('/?roster=3v3&intro=off&seed=3&fog=on');
  await matchUp(page);
  await waitForKill(page);
  await page.evaluate(() => window.__hookbrawl!.setPaused(true));

  const rows = await ledger(page);
  expect(rows.some((row) => row.gold !== null && row.gold < row.earned)).toBe(true);
  await page.getByRole('button', { name: 'Scores' }).click();
  const board = page.getByRole('region', { name: 'Scoreboard' });
  await expect(board).toBeVisible();
  await expectEarnedColumn(page, board);
  await expect(board.getByText('?')).toHaveCount(0);
  await page.screenshot({ path: `${SHOT_DIR}/earned-scoreboard.png` });
  await page.getByRole('button', { name: 'Scores' }).click();

  await page.evaluate(() => window.__hookbrawl!.setPaused(false));
  await page.evaluate((s) => window.__hookbrawl!.fastForward(s), LONG_MATCH);
  const over = page.getByRole('dialog', { name: 'match over' });
  await expect(over).toBeVisible();
  await expectEarnedColumn(page, over);
  await page.screenshot({ path: `${SHOT_DIR}/earned-end.png` });
});
