import { expect, test, type Page } from '@playwright/test';
import type { PlayerId, Vec2 } from '@hookwars/sim';

const SHOT_DIR = 'test-results';
const DESKTOP = { width: 1280, height: 720 };
const MAX_TABS = 40;

async function matchUp(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__hookwars !== undefined, null, { timeout: 30_000 });
  await expect(page.locator('#stage')).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
}

/** The enemy dummy's id and where the authority has it; only a test may ask the authority. */
async function dummy(page: Page): Promise<{ readonly id: PlayerId; readonly pos: Vec2 }> {
  return page.evaluate(() => {
    const d = window.__hookwars!.getState().players.find((p) => p.team === 'east')!;
    return { id: d.id, pos: d.pos };
  });
}

/** Whether `id` is in the local team's view, and whether the renderer drew them. */
async function seen(page: Page, id: PlayerId): Promise<{ readonly inView: boolean; readonly drawn: boolean }> {
  return page.evaluate((who) => {
    const hb = window.__hookwars!;
    return { inView: hb.getView().players.some((p) => p.id === who), drawn: hb.drawnPlayers().includes(who) };
  }, id);
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

async function hookAt(page: Page, target: Vec2): Promise<void> {
  const screen = await page.evaluate((p) => window.__hookwars!.worldToScreen(p), target);
  await page.mouse.move(screen.x, screen.y);
  await page.keyboard.press('Space');
}

/** Presses Tab until the focused control's label or name is `name`, as a keyboard player would. */
async function tabTo(page: Page, name: string): Promise<void> {
  for (let i = 0; i < MAX_TABS; i += 1) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const el = document.activeElement as HTMLInputElement | null;
      return el?.labels?.[0]?.textContent?.trim() ?? el?.getAttribute('aria-label') ?? el?.textContent?.trim() ?? '';
    });
    if (focused === name) return;
  }
  throw new Error(`Tab never reached "${name}"`);
}

test('under fog an idle dummy across the water is not given to the renderer until it is hooked', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto('/?seed=1&intro=off&opponent=idle&fog=on');
  await matchUp(page);
  const target = await dummy(page);
  expect(await seen(page, target.id)).toEqual({ inView: false, drawn: false });
  const view = await page.evaluate(() => window.__hookwars!.getView());
  expect(view.vision.kind).toBe('fog');
  const card = view.roster.find((c) => c.id === target.id);
  expect(card).not.toHaveProperty('gold');
  expect(view.players.some((p) => p.id === target.id)).toBe(false);

  await walkTo(page, 900, 500);
  expect(await seen(page, target.id)).toEqual({ inView: false, drawn: false });
  await hookAt(page, target.pos);
  await expect.poll(() => seen(page, target.id), { timeout: 5_000 }).toEqual({ inView: true, drawn: true });
  const status = await page.evaluate((id) => window.__hookwars!.getView().players.find((p) => p.id === id)?.status.kind, target.id);
  expect(['dragged', 'staggered', 'alive']).toContain(status);
});

test('with fog off the dummy is in view and drawn from the start', async ({ page }) => {
  await page.goto('/?seed=1&intro=off&opponent=idle');
  await matchUp(page);
  const target = await dummy(page);
  expect(await page.evaluate(() => window.__hookwars!.getView().vision.kind)).toBe('open');
  await expect.poll(() => seen(page, target.id)).toEqual({ inView: true, drawn: true });
});

test('the lobby opens with fog of war on, explains it, toggles it by keyboard, and the match plays under it', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  await page.getByLabel('Your name').fill('Ryan');
  await page.getByRole('button', { name: 'Play' }).click();
  await expect(page.getByRole('heading', { name: 'Lobby' })).toBeFocused();

  const fog = page.getByRole('switch', { name: 'Fog of war' });
  await expect(fog).toBeChecked();
  await expect(fog).toHaveAccessibleDescription(/Enemies show only when someone on your side/);
  await tabTo(page, 'Fog of war');
  await expect(fog).toBeFocused();
  await page.keyboard.press('Space');
  await expect(fog).not.toBeChecked();
  await page.keyboard.press('Space');
  await expect(fog).toBeChecked();
  await tabTo(page, 'Fill with bots');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOT_DIR}/fog-lobby.png` });

  await tabTo(page, 'Start match');
  await page.keyboard.press('Enter');
  await matchUp(page);
  const view = await page.evaluate(() => window.__hookwars!.getView());
  expect(view.vision.kind).toBe('fog');
  expect(view.roster).toHaveLength(6);
  expect(view.players.length).toBeLessThan(6);
});
