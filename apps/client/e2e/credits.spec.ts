import { expect, test, type Page } from '@playwright/test';

const SHOT_DIR = 'test-results';

async function tick(page: Page): Promise<number> {
  return page.evaluate(() => window.__hookbrawl!.getState().tick);
}

test('credits open from the HUD, pause the match, and close with Escape', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/?seed=1');
  await page.waitForFunction(() => window.__hookbrawl !== undefined);
  await expect.poll(() => tick(page)).toBeGreaterThan(5);

  const opener = page.getByRole('link', { name: 'Credits' });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: '致敬' });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/#\/credits$/);
  for (const name of ['Tossrock', 'Siraraz', 'X-cat-x', 'kunkka']) {
    await expect(dialog.getByText(name, { exact: true })).toBeVisible();
  }
  await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused();

  const pausedAt = await tick(page);
  await page.waitForTimeout(600);
  expect(await tick(page)).toBe(pausedAt);
  await page.screenshot({ path: `${SHOT_DIR}/m2-look-credits.png` });

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('');
  await expect(opener).toBeFocused();
  await expect.poll(() => tick(page)).toBeGreaterThan(pausedAt + 5);
});

test('a shared credits link opens paused and the back button closes it', async ({ page }) => {
  await page.goto('/?seed=1#/credits');
  await page.waitForFunction(() => window.__hookbrawl !== undefined);
  const dialog = page.getByRole('dialog', { name: '致敬' });
  await expect(dialog).toBeVisible();
  expect(await tick(page)).toBe(0);

  await page.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('');
  await expect.poll(() => tick(page)).toBeGreaterThan(0);

  await page.getByRole('link', { name: 'Credits' }).click();
  await expect(dialog).toBeVisible();
  await page.goBack();
  await expect(dialog).toBeHidden();
  await expect.poll(() => tick(page)).toBeGreaterThan(5);
});
