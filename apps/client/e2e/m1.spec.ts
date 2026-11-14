import { expect, test, type Page } from '@playwright/test';
import type { GameState, Player, Vec2 } from '@hookbrawl/sim';

const SHOT_DIR = 'test-results';

async function state(page: Page): Promise<GameState> {
  return page.evaluate(() => window.__hookbrawl!.getState());
}

async function localPlayer(page: Page): Promise<Player> {
  return page.evaluate(() => {
    const hb = window.__hookbrawl!;
    const id = hb.getLocalPlayerId();
    return hb.getState().players.find((p) => p.id === id)!;
  });
}

async function toScreen(page: Page, p: Vec2): Promise<Vec2> {
  return page.evaluate((world) => window.__hookbrawl!.worldToScreen(world), p);
}

async function localHookCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const hb = window.__hookbrawl!;
    return hb.getState().hooks.filter((h) => h.ownerId === hb.getLocalPlayerId()).length;
  });
}

const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

type Axis = 'x' | 'y';

/** Holds `key` until the local player's `axis` coordinate passes `mark` in the direction it moves. */
async function holdUntil(page: Page, key: string, axis: Axis, mark: number): Promise<void> {
  const from = (await localPlayer(page)).pos[axis];
  await page.keyboard.down(key);
  await page.waitForFunction(
    ([a, m, rising]) => {
      const hb = window.__hookbrawl!;
      const p = hb.getState().players.find((q) => q.id === hb.getLocalPlayerId())!;
      return rising ? p.pos[a] >= m : p.pos[a] <= m;
    },
    [axis, mark, mark > from] as const,
    { timeout: 8_000 },
  );
  await page.keyboard.up(key);
}

async function localScreenY(page: Page): Promise<number> {
  return (await toScreen(page, (await localPlayer(page)).pos)).y;
}

test('walk with W, throw a hook across the canal with Space, and see it come back', async ({ page }) => {
  await page.goto('/?seed=1');
  await expect(page.locator('#stage canvas')).toBeVisible();
  await page.waitForFunction(() => window.__hookbrawl !== undefined);

  const { arena } = await state(page);
  const start = await localPlayer(page);
  const screenYBefore = await localScreenY(page);
  await holdUntil(page, 'KeyW', 'y', start.pos.y - 200);
  expect(await localScreenY(page)).toBeLessThan(screenYBefore - 20);

  const aim = await toScreen(page, { x: (arena.canal.x1 + arena.width) / 2, y: (await localPlayer(page)).pos.y });
  await page.mouse.move(aim.x, aim.y);
  await page.keyboard.press('Space');
  await expect.poll(() => localHookCount(page), { timeout: 3_000 }).toBe(1);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOT_DIR}/m1.png` });
  await expect.poll(() => localHookCount(page), { timeout: 8_000 }).toBe(0);
});

async function waitForDummy(page: Page, status: Player['status']['kind']): Promise<void> {
  await page.waitForFunction(
    (wanted) => window.__hookbrawl!.getState().players.find((p) => p.team === 'east')?.status.kind === wanted,
    status,
    { timeout: 4_000 },
  );
}

test('a hook drags a dummy across the canal and drops it beside the thrower', async ({ page }) => {
  await page.goto('/?opponent=idle');
  await page.waitForFunction(() => window.__hookbrawl !== undefined);
  const { arena } = await state(page);
  const dummy = async (): Promise<Player> => (await state(page)).players.find((p) => p.team === 'east')!;
  const fullHp = (await dummy()).hp;

  // The buoy sits on the straight line between the two spawns, so throw from off that line.
  await holdUntil(page, 'KeyD', 'x', arena.canal.x0 - 100);
  const screenYBefore = await localScreenY(page);
  await holdUntil(page, 'ArrowUp', 'y', arena.height * 0.22);
  expect(await localScreenY(page)).toBeLessThan(screenYBefore - 20);

  // Let the release reach the sim on its next tick before sampling.
  await page.waitForTimeout(100);
  const released = (await localPlayer(page)).pos;
  await page.waitForTimeout(300);
  expect((await localPlayer(page)).pos).toEqual(released);

  const aim = await toScreen(page, (await dummy()).pos);
  await page.mouse.move(aim.x, aim.y);
  await page.keyboard.press('Space');
  // The drag lasts under a second, so watch it every frame; a coarse poll can sample either side of it.
  await waitForDummy(page, 'dragged');
  expect((await dummy()).hp).toBeLessThan(fullHp);
  await page.screenshot({ path: `${SHOT_DIR}/m1-latched.png` });

  await waitForDummy(page, 'alive');
  const dropped = await dummy();
  expect(dropped.pos.x).toBeLessThan(arena.canal.x0);
  await page.waitForTimeout(400);
  const gap = distance((await dummy()).pos, (await localPlayer(page)).pos);
  expect(gap).toBeGreaterThan(60);
  expect(gap).toBeLessThan(120);
  await page.screenshot({ path: `${SHOT_DIR}/m1-dropped.png` });
});

test('a left click throws the hook at the clicked point', async ({ page }) => {
  await page.goto('/?opponent=idle');
  await page.waitForFunction(() => window.__hookbrawl !== undefined);
  const { arena } = await state(page);
  const from = (await localPlayer(page)).pos;
  const target = { x: arena.canal.x1, y: arena.height * 0.25 };
  const click = await toScreen(page, target);
  await page.mouse.click(click.x, click.y);
  await expect.poll(() => localHookCount(page), { timeout: 3_000 }).toBe(1);

  const hook = (await state(page)).hooks[0]!;
  const wanted = Math.atan2(target.y - from.y, target.x - from.x);
  expect(Math.abs(Math.atan2(hook.dir.y, hook.dir.x) - wanted)).toBeLessThan(0.02);
});
