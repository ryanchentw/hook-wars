import { expect, test, type Locator, type Page } from '@playwright/test';

/** The development-only look panel: these run against the dev server, which is the only place it exists. */

async function ready(page: Page, query: string): Promise<void> {
  await page.goto(`/${query}`);
  await expect(page.locator('#stage')).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
}

const vignette = (page: Page): Promise<string> => page.evaluate(() => document.getElementById('stage')!.style.getPropertyValue('--vignette'));

async function openPanel(page: Page): Promise<Locator> {
  await page.keyboard.press('Backquote');
  const panel = page.getByRole('complementary', { name: 'Look tuning (development only)' });
  await expect(panel).toBeVisible();
  return panel;
}

/** The number field of the control with this label, with its folder opened if it was closed. */
async function field(panel: Locator, folder: string, label: string): Promise<Locator> {
  // The library draws its open-or-closed arrow into the button's name.
  const title = panel.getByRole('button', { name: new RegExp(`${folder}$`) });
  if ((await title.getAttribute('aria-expanded')) === 'false') await title.click();
  return panel.locator('.lil-controller', { has: panel.page().locator('.lil-name', { hasText: new RegExp(`^${label}$`) }) }).locator('input').last();
}

async function setField(input: Locator, value: string): Promise<void> {
  await input.fill(value);
  await input.press('Enter');
}

test('a slider changes the scene on show at once, is marked as an override, and survives a reload until reset', async ({ page }) => {
  await ready(page, '?scene=victoria&intro=off&opponent=idle&seed=1');
  const toggle = page.getByRole('button', { name: /^Look/ });
  await expect(toggle).toHaveText('Look');
  const shipped = await vignette(page);
  const panel = await openPanel(page);
  await expect(panel).toContainText('Look · victoria');

  await setField(await field(panel, 'Atmosphere', 'vignette'), '0.2');
  await expect.poll(() => vignette(page)).toBe('0.2');
  await expect(toggle).toHaveText('Look ● overrides on');
  await expect(panel).toContainText('Overrides active, not the shipped look: victoria 1');

  await ready(page, '?scene=victoria&intro=off&opponent=idle&seed=1');
  expect(await vignette(page)).toBe('0.2');
  await expect(page.getByRole('button', { name: /^Look/ })).toHaveText('Look ● overrides on');

  // Another scene keeps its shipped look, and the panel follows the scene on show.
  await ready(page, '?scene=daan&intro=off&opponent=idle&seed=1');
  expect(await vignette(page)).not.toBe('0.2');
  const again = await openPanel(page);
  await expect(again).toContainText('Look · daan');
  await again.getByRole('button', { name: 'Reset every scene' }).click();
  await expect(page.getByRole('button', { name: /^Look/ })).toHaveText('Look');
  await ready(page, '?scene=victoria&intro=off&opponent=idle&seed=1');
  expect(await vignette(page)).toBe(shipped);
});

test('keys typed in the panel do not move the fighter or throw a hook, and the match keeps running', async ({ page }) => {
  await ready(page, '?scene=harbour&intro=off&opponent=idle&seed=1');
  const panel = await openPanel(page);
  const me = (): Promise<{ readonly x: number; readonly hooks: number; readonly tick: number }> =>
    page.evaluate(() => {
      const hb = window.__hookwars!;
      const state = hb.getState();
      return { x: state.players.find((p) => p.id === hb.getLocalPlayerId())!.pos.x, hooks: state.hooks.length, tick: state.tick };
    });
  const before = await me();
  const box = panel.getByRole('textbox', { name: 'Look overrides as JSON, to apply' });
  await box.click();
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(400);
  await page.keyboard.up('KeyD');
  await page.keyboard.press('Space');
  await page.keyboard.press('KeyE');
  await expect(box).toHaveValue('d e');
  const after = await me();
  expect(after.x).toBe(before.x);
  expect(after.hooks).toBe(0);
  expect(after.tick).toBeGreaterThan(before.tick);
});

test('Copy puts the changed values on the clipboard as JSON by scene, and pasted JSON is checked before it is applied', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await ready(page, '?scene=golden-gate&intro=off&opponent=idle&seed=1');
  const panel = await openPanel(page);
  await setField(await field(panel, 'Atmosphere', 'vignette'), '0.1');
  await panel.getByRole('button', { name: 'Copy changed values as JSON' }).click();
  await expect(panel.getByRole('status')).toHaveText('Copied 1 changed values');
  expect(JSON.parse(await page.evaluate(() => navigator.clipboard.readText()))).toEqual({ 'golden-gate': { 'atmosphere.vignette': 0.1 } });

  const box = panel.getByRole('textbox', { name: 'Look overrides as JSON, to apply' });
  await box.fill('{ "golden-gate": { "atmosphere.vignette": 7, "fog.colour": "#fff" } }');
  await panel.getByRole('button', { name: 'Apply the JSON below' }).click();
  await expect(panel.getByRole('status')).toContainText('golden-gate atmosphere.vignette must be from 0 to 1');
  await expect(panel.getByRole('status')).toContainText('golden-gate fog.colour is not something the panel tunes');
  expect(await vignette(page)).toBe('0.1');

  await box.fill('{ "golden-gate": { "atmosphere.vignette": 0.9, "atmosphere.fog.color": "#102030" } }');
  await panel.getByRole('button', { name: 'Apply the JSON below' }).click();
  await expect.poll(() => vignette(page)).toBe('0.9');
  await expect(panel).toContainText('golden-gate 2');
  await panel.getByRole('button', { name: 'Reset this scene' }).click();
});
