import { expect, test, type Page, type Route } from '@playwright/test';

const MODELS = '**/assets/kaykit/**/*.glb';

async function tick(page: Page): Promise<number> {
  return page.evaluate(() => window.__hookbrawl!.getState().tick);
}

test('shows a loading panel, then a retryable error when a model fails, and starts the match after the retry', async ({ page }) => {
  const heldProps: Route[] = [];
  const heldCharacters: Route[] = [];
  await page.route(MODELS, (route) => {
    (route.request().url().includes('/characters/') ? heldCharacters : heldProps).push(route);
  });
  await page.goto('/?seed=1');

  const stage = page.locator('#stage');
  const status = page.getByRole('status');
  await expect(status).toContainText('Rigging the harbour');
  await expect(stage).toHaveAttribute('data-state', 'loading');
  expect(await page.evaluate(() => window.__hookbrawl === undefined)).toBe(true);
  await expect(page.locator('#stage canvas')).toHaveCount(0);

  await Promise.all(heldCharacters.map((route) => route.abort()));
  const alert = page.getByRole('alert');
  const retry = page.getByRole('button', { name: 'Try again' });
  await expect(alert).toContainText('Could not load characters/');
  await expect(stage).toHaveAttribute('data-state', 'error');

  // The other downloads finishing late must not paint the progress bar back over the error.
  await Promise.all(heldProps.map((route) => route.continue()));
  await page.waitForLoadState('networkidle');
  await expect(alert).toBeVisible();
  await expect(retry).toBeVisible();
  await expect(status).toBeHidden();
  expect(await page.evaluate(() => window.__hookbrawl === undefined)).toBe(true);

  await page.unroute(MODELS);
  await retry.click();
  await expect(stage).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  await expect(alert).toBeHidden();
  await expect(retry).toBeHidden();
  await expect(page.locator('#stage canvas')).toBeVisible();
  await expect.poll(() => tick(page)).toBeGreaterThan(5);
});

test('survives losing and regaining the WebGL context', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?seed=1');
  await page.waitForFunction(() => window.__hookbrawl !== undefined);
  await expect.poll(() => tick(page)).toBeGreaterThan(2);

  await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#stage canvas')!;
    const lose = canvas.getContext('webgl2')!.getExtension('WEBGL_lose_context')!;
    Object.assign(window, { __restoreContext: () => lose.restoreContext() });
    lose.loseContext();
  });
  await expect(page.getByRole('status')).toContainText('graphics context was lost');
  const frozenAt = await tick(page);
  await page.waitForTimeout(500);
  expect(await tick(page)).toBe(frozenAt);

  await page.evaluate(() => (window as unknown as { __restoreContext: () => void }).__restoreContext());
  await expect(page.getByRole('status')).toBeHidden();
  // A restored context starts empty: every shader is rebuilt before the next frame, which software GL does slowly.
  await expect.poll(() => tick(page), { timeout: 20_000 }).toBeGreaterThan(frozenAt + 5);
  expect(errors).toEqual([]);
});
