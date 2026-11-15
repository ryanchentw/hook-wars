import { expect, test, type Locator, type Page } from '@playwright/test';

const SHOT_DIR = 'test-results';
const DESKTOP = { width: 1280, height: 720 };
const PHONE = { width: 390, height: 844 };
const LONG_MATCH = 3_000;
const FEED_STEP_SECONDS = 5;
const FEED_TRIES = 120;
/** The widest name a player may pick: 16 of the widest letter. */
const LONG_BOT = 'WWWWWWWWWWWWWWWW (bot)';
const BOTS = ['Gull', 'Tern', 'Pike', 'Eel', 'Skate'];

async function matchUp(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__hookbrawl !== undefined, null, { timeout: 30_000 });
  await expect(page.locator('#stage')).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
}

async function openScores(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Scores' }).click();
  const board = page.getByRole('region', { name: 'Scoreboard' });
  await expect(board).toBeVisible();
  return board;
}

/** Runs the match ahead a few seconds at a time until the feed shows a kill by a bot. */
async function waitForBotKill(page: Page): Promise<Locator> {
  const botKill = page.locator('.hud-feed li').filter({ has: page.locator('span:first-child', { hasText: '(bot)' }) });
  for (let i = 0; i < FEED_TRIES && (await botKill.count()) === 0; i += 1) {
    await page.evaluate((s) => window.__hookbrawl!.fastForward(s), FEED_STEP_SECONDS);
  }
  await expect(botKill.first()).toBeVisible();
  return botKill.first();
}

async function finishMatch(page: Page): Promise<Locator> {
  await page.evaluate((s) => window.__hookbrawl!.fastForward(s), LONG_MATCH);
  const over = page.getByRole('dialog', { name: 'match over' });
  await expect(over).toBeVisible();
  return over;
}

/**
 * Gives every name in the scope the longest name a bot can carry, as a dropped player with a 16-letter name has.
 * Only the name's own text node changes, so React still owns the rest.
 */
async function lengthenNames(scope: Locator, selector: string): Promise<void> {
  await scope.locator(selector).evaluateAll((els, text) => {
    for (const el of els) if (el.firstChild !== null) el.firstChild.nodeValue = text;
  }, LONG_BOT);
}

const setPaused = (page: Page, paused: boolean) => page.evaluate((p) => window.__hookbrawl!.setPaused(p), paused);

async function expectInside(page: Page, inner: Locator, outer: Locator): Promise<void> {
  const [a, b] = [(await inner.boundingBox())!, (await outer.boundingBox())!];
  expect(a.x).toBeGreaterThanOrEqual(b.x - 0.5);
  expect(a.x + a.width).toBeLessThanOrEqual(b.x + b.width + 0.5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
}

test('every bot carries (bot) over its head, in the feed, on the scoreboard and in the final table', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize(DESKTOP);
  await page.goto('/?roster=3v3&intro=off&seed=3');
  await matchUp(page);
  const names = page.locator('.unit-name');
  await expect(names).toHaveText(['You', ...BOTS.map((b) => `${b} (bot)`)]);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${SHOT_DIR}/botname-3v3-labels.png` });

  const board = await openScores(page);
  await expect(board.locator('tbody th[scope="row"]')).toHaveText([/^You(you)?$/, 'Gull (bot)', 'Tern (bot)', 'Pike (bot)', 'Eel (bot)', 'Skate (bot)']);
  await expect(board.getByRole('rowheader', { name: 'Pike (bot)', exact: true })).toBeVisible();
  await expect(board.locator('.score-tag', { hasText: 'bot' })).toHaveCount(0);
  await page.screenshot({ path: `${SHOT_DIR}/botname-scoreboard.png` });
  await page.getByRole('button', { name: 'Scores' }).click();

  const kill = await waitForBotKill(page);
  await expect(kill).toContainText(/\(bot\) decked/);
  await page.screenshot({ path: `${SHOT_DIR}/botname-killfeed.png` });

  const over = await finishMatch(page);
  await expect(over.locator('tbody th[scope="row"]')).toHaveText([/^You(you)?$/, 'Gull (bot)', 'Tern (bot)', 'Pike (bot)', 'Eel (bot)', 'Skate (bot)']);
  await expect(over.locator('.score-tag', { hasText: 'bot' })).toHaveCount(0);
  await page.screenshot({ path: `${SHOT_DIR}/botname-end.png` });
});

for (const viewport of [DESKTOP, PHONE]) {
  test(`a 16-letter bot name fits the feed, the scoreboard and the final table at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(viewport);
    await page.goto('/?roster=3v3&intro=off&seed=3');
    await matchUp(page);

    const kill = await waitForBotKill(page);
    await setPaused(page, true);
    await lengthenNames(kill, 'span');
    await expectInside(page, kill, page.locator('body'));
    const score = (await page.locator('.hud-score').boundingBox())!;
    const killBox = (await kill.boundingBox())!;
    expect(killBox.y >= score.y + score.height || killBox.x >= score.x + score.width).toBe(true);

    const board = await openScores(page);
    await lengthenNames(board, 'tbody th[scope="row"]');
    await expectInside(page, board.locator('table'), board);
    await page.screenshot({ path: `${SHOT_DIR}/botname-long-${viewport.width}.png` });
    await page.getByRole('button', { name: 'Scores' }).click();

    await setPaused(page, false);
    const over = await finishMatch(page);
    await lengthenNames(over, 'tbody th[scope="row"]');
    await expectInside(page, over.locator('table'), over);
    await page.screenshot({ path: `${SHOT_DIR}/botname-long-end-${viewport.width}.png` });
  });
}
