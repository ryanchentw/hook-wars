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

async function localX(page: Page): Promise<number> {
  return page.evaluate(() => {
    const hb = window.__hookbrawl!;
    return hb.getState().players.find((p) => p.id === hb.getLocalPlayerId())!.pos.x;
  });
}

async function localHooks(page: Page): Promise<number> {
  return page.evaluate(() => {
    const hb = window.__hookbrawl!;
    return hb.getState().hooks.filter((h) => h.ownerId === hb.getLocalPlayerId()).length;
  });
}

test('a key released behind the credits dialog does not leave the player walking, and Space is a game key again once it closes', async ({ page }) => {
  await page.goto('/?opponent=idle');
  await page.waitForFunction(() => window.__hookbrawl !== undefined);
  const startX = await localX(page);

  await page.keyboard.down('d');
  await expect.poll(() => localX(page)).toBeGreaterThan(startX + 30);
  await page.getByRole('link', { name: 'Credits' }).click();
  const dialog = page.getByRole('dialog', { name: '致敬' });
  await expect(dialog).toBeVisible();
  await page.keyboard.up('d');

  // Space belongs to the dialog while it is open: it presses the focused Close button and throws nothing.
  await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(dialog).toBeHidden();
  const resumedAt = await tick(page);
  await expect.poll(() => tick(page)).toBeGreaterThan(resumedAt + 10);
  const restingX = await localX(page);
  await page.waitForTimeout(300);
  expect(await localX(page)).toBe(restingX);
  expect(await localHooks(page)).toBe(0);

  await page.keyboard.press('Space');
  await expect.poll(() => localHooks(page), { timeout: 3_000 }).toBe(1);
  await expect(page).toHaveURL(/\/\?opponent=idle$/);
});
