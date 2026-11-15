import { expect, test, type Page } from '@playwright/test';
import type { PlayerId, Vec2 } from '@hookwars/sim';

const SHOT_DIR = 'test-results';
const DESKTOP = { width: 1280, height: 720 };
const PHONE = { width: 390, height: 844 };
const TICK = 1 / 30;
const UNSEEN_TICKS = 6;
const FILES = 38;

async function matchUp(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__hookwars !== undefined, null, { timeout: 30_000 });
  await expect(page.locator('#stage')).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
}

/** Every effect and track has been asked for: sounds asked for before then are skipped. */
async function soundsLoaded(page: Page): Promise<void> {
  await page.waitForFunction((count) => window.__hookwarsAudio!.loaded() >= count, FILES, { timeout: 10_000 });
}

const requested = (page: Page): Promise<readonly string[]> => page.evaluate(() => window.__hookwarsAudio!.requested());

async function dummy(page: Page): Promise<{ readonly id: PlayerId; readonly pos: Vec2 }> {
  return page.evaluate(() => {
    const d = window.__hookwars!.getState().players.find((p) => p.team === 'east')!;
    return { id: d.id, pos: d.pos };
  });
}

/** Walks north-east until past `x` and north of `y`, off the line through the buoy, which would bounce a straight throw home. */
async function walkTo(page: Page, x: number, y: number): Promise<void> {
  await page.keyboard.down('KeyD');
  await page.keyboard.down('KeyW');
  await page.waitForFunction(
    ([mx, my]) => {
      const hb = window.__hookwars!;
      const me = hb.getState().players.find((p) => p.id === hb.getLocalPlayerId())!;
      return me.pos.x >= mx && me.pos.y <= my;
    },
    [x, y] as const,
    { timeout: 8_000 },
  );
  await page.keyboard.up('KeyW');
  await page.keyboard.up('KeyD');
}

test('audio stays off under automation unless the address asks for it', async ({ page }) => {
  await page.goto('/?seed=1&intro=off');
  await matchUp(page);
  expect(await page.evaluate(() => window.__hookwarsAudio)).toBeUndefined();
});

test('a hook that lands asks for the throw, the hit and nothing before the first gesture', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto('/?seed=1&intro=off&opponent=idle&audio=fake');
  await matchUp(page);
  await soundsLoaded(page);
  expect(await requested(page)).toEqual([]);

  await walkTo(page, 900, 500);
  const target = await dummy(page);
  await page.evaluate(() => window.__hookwarsAudio!.clear());
  const screen = await page.evaluate((p) => window.__hookwars!.worldToScreen(p), target.pos);
  await page.mouse.move(screen.x, screen.y);
  await page.keyboard.press('Space');
  await expect.poll(() => requested(page), { timeout: 5_000 }).toContain('hookHit');
  expect(await requested(page)).toContain('hookThrow');
});

test('under fog a hook thrown out of sight asks for no sound at all', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto('/?seed=1&intro=off&opponent=idle&fog=on&audio=fake');
  await matchUp(page);
  await soundsLoaded(page);
  await page.keyboard.press('Shift');
  const target = await dummy(page);
  const trace = await page.evaluate(
    ({ id, ticks, dt }) => {
      const hb = window.__hookwars!;
      const probe = window.__hookwarsAudio!;
      hb.freeze(true);
      hb.fastForward(dt);
      probe.clear();
      const away = { x: hb.getState().arena.width, y: hb.getState().players.find((p) => p.id === id)!.pos.y };
      hb.queueInput({ kind: 'hook', playerId: id, target: away });
      const authority: string[] = [];
      const seen: string[] = [];
      for (let i = 0; i < ticks; i += 1) {
        hb.fastForward(dt);
        authority.push(...hb.getState().events.map((e) => e.kind));
        seen.push(...hb.getView().events.map((e) => e.kind));
      }
      const sounds = probe.requested();
      const inView = hb.getView().players.some((p) => p.id === id);
      hb.queueInput({ kind: 'hook', playerId: hb.getLocalPlayerId(), target: away });
      for (let i = 0; i < ticks; i += 1) hb.fastForward(dt);
      return { authority, seen, sounds, inView, ownThrow: probe.requested() };
    },
    { id: target.id, ticks: UNSEEN_TICKS, dt: TICK },
  );
  expect(trace.authority).toContain('hookCast');
  expect(trace.inView).toBe(false);
  expect(trace.seen).toEqual([]);
  expect(trace.sounds).toEqual([]);
  expect(trace.ownThrow).toContain('hookThrow');
});

test('M mutes and is remembered, but not while typing a name', async ({ page }) => {
  await page.goto('/?audio=fake');
  const mute = page.getByRole('checkbox', { name: /Mute/ });
  await expect(mute).not.toBeChecked();
  await page.getByLabel('Your name').fill('');
  await page.getByLabel('Your name').pressSequentially('Mim');
  await expect(mute).not.toBeChecked();
  await page.getByRole('heading', { name: 'Hook Wars' }).click();
  await page.keyboard.press('KeyM');
  await expect(mute).toBeChecked();
  await page.getByRole('slider', { name: 'Music' }).fill('20');
  await page.reload();
  await expect(page.getByRole('checkbox', { name: /Mute/ })).toBeChecked();
  await expect(page.getByRole('slider', { name: 'Music' })).toHaveValue('20');
  await expect(page.getByText('20%')).toBeVisible();
});

for (const [label, size] of [['1280', DESKTOP], ['390', PHONE]] as const) {
  test(`sound settings on the main menu and in the pause menu at ${label}px`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto('/');
    await expect(page.getByRole('group', { name: 'Sound' })).toBeVisible();
    await page.getByRole('group', { name: 'Sound' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOT_DIR}/audio-menu-${label}.png` });

    await page.goto('/?seed=1&intro=off');
    await matchUp(page);
    await page.keyboard.press('Escape');
    const pause = page.getByRole('dialog', { name: 'Paused' });
    await expect(pause.getByRole('slider', { name: 'Effects' })).toBeVisible();
    await page.screenshot({ path: `${SHOT_DIR}/audio-pause-${label}.png` });
  });
}
