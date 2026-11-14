import { expect, test, type Page } from '@playwright/test';
import { SCENE_IDS, type SceneId } from '../src/render/scenes/types';

type Memory = { readonly geometries: number; readonly textures: number };

async function ready(page: Page, query: string): Promise<void> {
  await page.goto(`/${query}`);
  await expect(page.locator('#stage')).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
}

async function sceneId(page: Page): Promise<SceneId> {
  return page.evaluate(() => window.__hookbrawl!.sceneId());
}

async function tick(page: Page): Promise<number> {
  return page.evaluate(() => window.__hookbrawl!.getState().tick);
}

async function introActive(page: Page): Promise<boolean> {
  return page.evaluate(() => window.__hookbrawl!.introActive());
}

/** Starts the next match and waits until it is being drawn. */
async function nextMatch(page: Page): Promise<void> {
  await page.evaluate(() => window.__hookbrawl!.restart());
  // Two frames: one to build whatever the new match needs, one to have drawn it.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

for (const id of SCENE_IDS) {
  test(`the ${id} scene reaches ready and plays without a console error`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await ready(page, `?scene=${id}&intro=off&seed=1`);
    expect(await sceneId(page)).toBe(id);
    await expect(page.locator('#stage')).toHaveAttribute('data-scene', id);
    await expect.poll(() => tick(page)).toBeGreaterThan(15);
    const stats = await page.evaluate(() => window.__hookbrawl!.renderStats());
    expect(stats.calls).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
}

test('an unknown ?scene falls back to the first scene in the rotation', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await ready(page, '?scene=atlantis&intro=off');
  expect(await sceneId(page)).toBe(SCENE_IDS[0]);
  await expect.poll(() => tick(page)).toBeGreaterThan(5);
  expect(errors).toEqual([]);
});

test('with no ?scene each new match moves on to the next scene, and a chosen scene stays', async ({ page }) => {
  await ready(page, '?intro=off&opponent=idle');
  const seen: SceneId[] = [await sceneId(page)];
  for (let i = 0; i < SCENE_IDS.length; i += 1) {
    await nextMatch(page);
    seen.push(await sceneId(page));
  }
  expect(seen).toEqual([...SCENE_IDS, SCENE_IDS[0]]);

  await ready(page, '?scene=daan&intro=off&opponent=idle');
  await nextMatch(page);
  await nextMatch(page);
  expect(await sceneId(page)).toBe('daan');
});

test('cycling through every scene three times leaves no more geometries or textures on the GPU than the first time round', async ({ page }) => {
  test.setTimeout(120_000);
  await ready(page, '?intro=off&opponent=idle');
  const rounds: Record<string, Memory>[] = [];
  for (let round = 0; round < 3; round += 1) {
    const counts: Record<string, Memory> = {};
    for (let i = 0; i < SCENE_IDS.length; i += 1) {
      const id = await sceneId(page);
      // Long enough for a fighter to have been drawn with everything it carries.
      await page.waitForTimeout(400);
      const { geometries, textures } = await page.evaluate(() => window.__hookbrawl!.renderStats());
      counts[id] = { geometries, textures };
      await nextMatch(page);
    }
    rounds.push(counts);
  }
  test.info().annotations.push({ type: 'gpu memory by round', description: JSON.stringify(rounds) });
  expect(Object.keys(rounds[0]!).sort()).toEqual([...SCENE_IDS].sort());
  expect(rounds[1]).toEqual(rounds[0]);
  expect(rounds[2]).toEqual(rounds[0]);
});

test('a match opens on an establishing shot that holds the sim, names the place, and ends by itself', async ({ page }) => {
  await ready(page, '?scene=golden-gate&opponent=idle');
  expect(await introActive(page)).toBe(true);
  await expect(page.locator('.title-card-name')).toHaveText('The Golden Gate');
  await expect(page.locator('#hud')).toHaveClass(/is-intro/);
  await page.waitForTimeout(700);
  expect(await introActive(page)).toBe(true);
  expect(await tick(page)).toBe(0);

  await expect.poll(() => introActive(page), { timeout: 8_000 }).toBe(false);
  await expect(page.locator('.title-card')).toBeHidden();
  await expect(page.locator('#hud')).not.toHaveClass(/is-intro/);
  await expect.poll(() => tick(page)).toBeGreaterThan(5);
});

test('any key skips the establishing shot without being played as a move, and a click does too', async ({ page }) => {
  await ready(page, '?scene=victoria&opponent=idle');
  expect(await introActive(page)).toBe(true);
  await page.keyboard.press('Space');
  await expect.poll(() => introActive(page), { timeout: 2_000 }).toBe(false);
  await expect.poll(() => tick(page)).toBeGreaterThan(5);
  expect(await page.evaluate(() => window.__hookbrawl!.getState().hooks.length)).toBe(0);

  await ready(page, '?scene=daan&opponent=idle');
  expect(await introActive(page)).toBe(true);
  await page.mouse.click(640, 360);
  await expect.poll(() => introActive(page), { timeout: 2_000 }).toBe(false);
  await expect.poll(() => tick(page)).toBeGreaterThan(5);
  expect(await page.evaluate(() => window.__hookbrawl!.getState().hooks.length)).toBe(0);
});

test('the establishing shot replays on a new match only when the scene has changed', async ({ page }) => {
  await ready(page, '?scene=harbour&opponent=idle');
  await page.keyboard.press('Escape');
  await expect.poll(() => introActive(page), { timeout: 2_000 }).toBe(false);
  await nextMatch(page);
  expect(await introActive(page)).toBe(false);

  await ready(page, '?opponent=idle');
  await page.keyboard.press('Escape');
  await expect.poll(() => introActive(page), { timeout: 2_000 }).toBe(false);
  await nextMatch(page);
  expect(await sceneId(page)).toBe(SCENE_IDS[1]);
  expect(await introActive(page)).toBe(true);
  expect(await tick(page)).toBe(0);
});

test('people who ask for less motion get a still shot and a cut', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page, '?scene=daan&opponent=idle');
  expect(await introActive(page)).toBe(true);
  const poseAt = (): Promise<{ readonly x: number; readonly y: number }> =>
    page.evaluate(() => {
      const hb = window.__hookbrawl!;
      return hb.worldToScreen(hb.getState().arena.buoy.pos);
    });
  const early = await poseAt();
  await page.waitForTimeout(500);
  if (await introActive(page)) expect(await poseAt()).toEqual(early);
  await expect.poll(() => introActive(page), { timeout: 8_000 }).toBe(false);
  await expect.poll(() => tick(page)).toBeGreaterThan(5);
});

test('?intro=off starts the match at once', async ({ page }) => {
  await ready(page, '?scene=victoria&intro=off&opponent=idle');
  expect(await introActive(page)).toBe(false);
  await expect(page.locator('.title-card')).toBeHidden();
  await expect.poll(() => tick(page)).toBeGreaterThan(5);
});
