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

test('move, throw a hook across the canal, and see it come back', async ({ page }) => {
  await page.goto('/?seed=1');
  await expect(page.locator('#stage canvas')).toBeVisible();
  await page.waitForFunction(() => window.__hookbrawl !== undefined);

  const { arena } = await state(page);
  const start = await localPlayer(page);
  const moveTarget = { x: arena.canal.x0 / 2, y: arena.height * 0.3 };
  const before = distance(start.pos, moveTarget);
  const click = await toScreen(page, moveTarget);
  await page.mouse.click(click.x, click.y, { button: 'right' });
  await expect.poll(async () => distance((await localPlayer(page)).pos, moveTarget), { timeout: 5_000 }).toBeLessThan(before - 100);

  const aim = await toScreen(page, { x: (arena.canal.x1 + arena.width) / 2, y: arena.height * 0.3 });
  await page.mouse.move(aim.x, aim.y);
  await page.keyboard.press('q');
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
  const stand = { x: arena.canal.x0 - 100, y: arena.height * 0.22 };
  const click = await toScreen(page, stand);
  await page.mouse.click(click.x, click.y, { button: 'right' });
  await expect.poll(async () => distance((await localPlayer(page)).pos, stand), { timeout: 8_000 }).toBeLessThan(5);

  const aim = await toScreen(page, (await dummy()).pos);
  await page.mouse.move(aim.x, aim.y);
  await page.keyboard.press('q');
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
