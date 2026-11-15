import { expect, test, type Locator, type Page } from '@playwright/test';
import { SCENE_IDS } from '../src/render/scenes/types';

/**
 * High quality draws the scene again for the water's mirror image and the light sources again for the glow, then
 * eight small passes. The heaviest scene at rest comes to about 290 calls; a fight adds a few dozen.
 */
const HIGH_BUDGET = { calls: 400, triangles: 700_000 } as const;

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

async function ready(page: Page, query: string): Promise<void> {
  await page.goto(`/${query}`);
  await expect(page.locator('#stage')).toHaveAttribute('data-state', 'ready', { timeout: 45_000 });
}

const tick = (page: Page): Promise<number> => page.evaluate(() => window.__hookwars!.getState().tick);
const calls = (page: Page): Promise<number> => page.evaluate(() => window.__hookwars!.renderStats().calls);

for (const scene of SCENE_IDS) {
  test(`at high quality the ${scene} scene reaches ready and plays, glow and reflections on, without a console error`, async ({ page }) => {
    test.setTimeout(90_000);
    const errors = collectErrors(page);
    await ready(page, `?scene=${scene}&intro=off&seed=1&roster=2v2&quality=high`);
    await expect.poll(() => tick(page), { timeout: 20_000 }).toBeGreaterThan(15);
    const stats = await page.evaluate(() => window.__hookwars!.renderStats());
    expect(stats.calls).toBeGreaterThan(0);
    expect(stats.calls).toBeLessThanOrEqual(HIGH_BUDGET.calls);
    expect(stats.triangles).toBeLessThanOrEqual(HIGH_BUDGET.triangles);
    test.info().annotations.push({ type: 'draw cost at high quality', description: JSON.stringify({ scene, ...stats }) });
    expect(errors).toEqual([]);
  });
}

test('the pause menu changes the quality at once and the choice is remembered', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await ready(page, '?scene=harbour&intro=off&opponent=idle&seed=1');
  await expect.poll(() => tick(page)).toBeGreaterThan(5);
  const plain = await calls(page);

  await page.keyboard.press('Escape');
  const pause = page.getByRole('dialog', { name: 'Paused' });
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await pause.getByRole('button', { name: 'Settings' }).click();
  await expect(settings.getByRole('radio', { name: 'Low' })).toBeChecked();
  await settings.getByRole('radio', { name: 'High' }).check();
  await settings.getByRole('button', { name: 'Done' }).click();
  await pause.getByRole('button', { name: 'Resume' }).click();
  // The mirror image and the light sources are each a second trip through the scene.
  await expect.poll(() => calls(page), { timeout: 15_000 }).toBeGreaterThan(plain * 1.3);

  await ready(page, '?scene=harbour&intro=off&opponent=idle&seed=1');
  await expect.poll(() => calls(page), { timeout: 15_000 }).toBeGreaterThan(plain * 1.3);
  await page.keyboard.press('Escape');
  await page.getByRole('dialog', { name: 'Paused' }).getByRole('button', { name: 'Settings' }).click();
  await expect(settings.getByRole('radio', { name: 'High' })).toBeChecked();
  expect(errors).toEqual([]);
});

test('the main menu offers the quality too, and ?quality= overrides it for one visit without changing it', async ({ page }) => {
  const menuQuality = async (query: string): Promise<Locator> => {
    // Each visit loads the scene again, which under software WebGL can outlast the default wait.
    await page.goto(`/${query}`);
    await expect(page.locator('#stage')).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
    await page.getByRole('button', { name: 'Settings' }).click();
    return page.getByRole('dialog', { name: 'Settings' });
  };
  await expect((await menuQuality('')).getByRole('radio', { name: 'Low' })).toBeChecked();
  await expect((await menuQuality('?quality=high')).getByRole('radio', { name: 'High' })).toBeChecked();
  await expect((await menuQuality('')).getByRole('radio', { name: 'Low' })).toBeChecked();
});

test('at high quality the picture survives losing and regaining the WebGL context', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await ready(page, '?scene=victoria&intro=off&opponent=idle&seed=1&quality=high');
  await expect.poll(() => tick(page)).toBeGreaterThan(5);
  await page.evaluate(() => {
    const lose = document.querySelector('canvas')!.getContext('webgl2')!.getExtension('WEBGL_lose_context')!;
    Object.assign(window, { __restoreContext: () => lose.restoreContext() });
    lose.loseContext();
  });
  await expect(page.getByRole('status')).toContainText('graphics context was lost');
  await page.evaluate(() => (window as unknown as { __restoreContext: () => void }).__restoreContext());
  await expect(page.getByRole('status')).toBeHidden({ timeout: 60_000 });
  const before = await tick(page);
  await expect.poll(() => tick(page), { timeout: 30_000 }).toBeGreaterThan(before + 5);
  expect(await calls(page)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
