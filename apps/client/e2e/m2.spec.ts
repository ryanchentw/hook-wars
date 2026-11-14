import { expect, test, type Page } from '@playwright/test';
import { ECONOMY, hookStats, ITEMS, TUNING, UPGRADES } from '@hookbrawl/sim';
import type { GameState, Player, Vec2 } from '@hookbrawl/sim';
import { SHOP_SLOTS } from '../src/game/bindings';
import { SCENE_IDS } from '../src/render/scenes/types';

const SHOT_DIR = 'test-results';
const MAX_DAMAGE_LEVEL = UPGRADES.damage.costs.length;
/** Mirrors the sim's whole-second slack so passive income is counted the same way. */
const SLACK = 1e-6;
const HUD_BAND = 84;

type Snapshot = { readonly time: number; readonly me: Player; readonly dummy: Player; readonly state: GameState };

async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => {
    const hb = window.__hookbrawl!;
    const state = hb.getState();
    const me = state.players.find((p) => p.id === hb.getLocalPlayerId())!;
    const dummy = state.players.find((p) => p.team === 'east')!;
    return { time: state.time, me, dummy, state };
  });
}

/** Every match here skips its establishing shot, so nothing waits on it. */
async function boot(page: Page, query: string): Promise<void> {
  await page.goto(`/${query}&intro=off`);
  await page.waitForFunction(() => window.__hookbrawl !== undefined);
}

const passiveBetween = (t0: number, t1: number): number =>
  ECONOMY.passiveGold * (Math.floor(t1 + SLACK) - Math.floor(t0 + SLACK));

async function toScreen(page: Page, p: Vec2): Promise<Vec2> {
  return page.evaluate((world) => window.__hookbrawl!.worldToScreen(world), p);
}

/** Holds `key` until the local player's `axis` coordinate passes `mark` in the direction it moves. */
async function holdUntil(page: Page, key: string, axis: 'x' | 'y', mark: number): Promise<void> {
  const from = (await snapshot(page)).me.pos[axis];
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

async function waitForArrivalEast(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const hb = window.__hookbrawl!;
      const s = hb.getState();
      const p = s.players.find((q) => q.id === hb.getLocalPlayerId())!;
      return p.status.kind === 'alive' && p.pos.x > s.arena.canal.x1;
    },
    undefined,
    { timeout: 8_000 },
  );
}

async function waitForGrappleCooldown(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const hb = window.__hookbrawl!;
      const s = hb.getState();
      const p = s.players.find((q) => q.id === hb.getLocalPlayerId())!;
      return p.status.kind === 'alive' && p.items.grapple.kind === 'owned' && p.items.grapple.readyAt > s.time;
    },
    undefined,
    { timeout: 8_000 },
  );
}

test('5 buys the grapple, E pulls the player onto the east dock, and a second E waits out the cooldown', async ({ page }) => {
  await boot(page, '?opponent=idle');
  const before = await snapshot(page);
  await page.keyboard.press('Digit5');
  await expect.poll(async () => (await snapshot(page)).me.items.grapple.kind).toBe('owned');
  const after = await snapshot(page);
  expect(after.me.gold).toBe(before.me.gold - ITEMS.grapple.cost + passiveBetween(before.time, after.time));
  await expect(page.getByRole('button', { name: /^Grapple, owned$/ })).toBeVisible();

  const { arena } = before.state;
  const aim = await toScreen(page, { x: arena.canal.x1 + 300, y: arena.height * 0.4 });
  await page.mouse.move(aim.x, aim.y);
  await page.keyboard.press('KeyE');
  await waitForArrivalEast(page);
  const landed = await snapshot(page);
  expect(landed.state.grapples).toHaveLength(0);

  await page.keyboard.press('KeyE');
  await page.waitForTimeout(400);
  const later = await snapshot(page);
  expect(later.me.status.kind).toBe('alive');
  expect(later.state.grapples).toHaveLength(0);
  expect(later.me.items.grapple).toEqual(landed.me.items.grapple);
  expect(later.me.pos).toEqual(landed.me.pos);
});

test('1 levels damage until maxed, a further press is refused, and the hook then hits for the upgraded damage', async ({ page }) => {
  await boot(page, '?gold=2000&opponent=idle');
  for (let level = 1; level <= MAX_DAMAGE_LEVEL; level += 1) {
    await page.keyboard.press('Digit1');
    await expect.poll(async () => (await snapshot(page)).me.upgrades.damage).toBe(level);
  }
  const maxed = await snapshot(page);
  await page.keyboard.press('Digit1');
  await expect(page.locator('.hud-slot-flash.is-bad')).toHaveText('Maxed');
  const after = await snapshot(page);
  expect(after.me.upgrades.damage).toBe(MAX_DAMAGE_LEVEL);
  expect(after.me.gold).toBe(maxed.me.gold + passiveBetween(maxed.time, after.time));

  const damage = hookStats(after.me).damage;
  expect(damage).not.toBe(TUNING.hookDamage);
  const { arena } = after.state;
  // The buoy sits on the straight line between the two spawns, so throw from off that line.
  await holdUntil(page, 'KeyD', 'x', arena.canal.x0 - 100);
  await holdUntil(page, 'ArrowUp', 'y', arena.height * 0.22);
  await page.waitForTimeout(100);
  const aim = await toScreen(page, (await snapshot(page)).dummy.pos);
  await page.mouse.move(aim.x, aim.y);
  await page.keyboard.press('Space');
  const hpOnLatch = await page.waitForFunction(
    () => {
      const dummy = window.__hookbrawl!.getState().players.find((p) => p.team === 'east')!;
      return dummy.status.kind === 'dragged' ? dummy.hp : null;
    },
    undefined,
    { timeout: 4_000 },
  );
  expect(await hpOnLatch.jsonValue()).toBe(TUNING.maxHp - damage);
});

test('clicking a shop slot buys it', async ({ page }) => {
  await boot(page, '?gold=500&opponent=idle');
  await page.getByRole('button', { name: /^Damage, level 0/ }).click();
  await expect.poll(async () => (await snapshot(page)).me.upgrades.damage).toBe(1);
  await expect(page.locator('.hud-slot-flash.is-good')).toHaveText('Bought');
  await expect(page.locator('.hud-announcer')).toHaveText(`Bought Damage, now level 1 of ${MAX_DAMAGE_LEVEL}.`);
});

test('a digit pressed while the credits dialog is open buys nothing', async ({ page }) => {
  await boot(page, '?gold=2000&opponent=idle');
  await page.getByRole('link', { name: 'Credits' }).click();
  const dialog = page.getByRole('dialog', { name: '致敬' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Digit1');
  await page.keyboard.press('Digit5');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  const resumed = (await snapshot(page)).state.tick;
  await expect.poll(async () => (await snapshot(page)).state.tick).toBeGreaterThan(resumed + 5);
  const { me } = await snapshot(page);
  expect(me.upgrades.damage).toBe(0);
  expect(me.items.grapple.kind).toBe('unowned');
});

/**
 * The ceiling for every scene. The night harbour is the heaviest: about 96 draw calls and 211k triangles at rest,
 * a few more with a rope or a slash out. The scenes built from merged parts sit well under it.
 */
const BUDGET = { calls: 150, triangles: 350_000 } as const;
const SAMPLE_MS = 40;

type DrawCost = { readonly calls: number; readonly triangles: number };

/** Polls the renderer's numbers until `done` holds in the sim, and returns the worst frame seen. */
async function worstUntil(page: Page, done: (state: GameState) => boolean, timeout = 8_000): Promise<DrawCost> {
  let worst: DrawCost = { calls: 0, triangles: 0 };
  const until = Date.now() + timeout;
  for (;;) {
    const { stats, state } = await page.evaluate(() => {
      const hb = window.__hookbrawl!;
      return { stats: hb.renderStats(), state: hb.getState() };
    });
    worst = { calls: Math.max(worst.calls, stats.calls), triangles: Math.max(worst.triangles, stats.triangles) };
    if (done(state)) return worst;
    if (Date.now() > until) throw new Error('the scripted moment never came');
    await page.waitForTimeout(SAMPLE_MS);
  }
}

for (const scene of SCENE_IDS) {
  test(`in the ${scene} scene a grapple across the canal and a brawl on the far dock both draw within budget`, async ({ page }) => {
    await boot(page, `?opponent=idle&gold=500&scene=${scene}`);
    await page.keyboard.press('Digit5');
    await page.waitForFunction(() => window.__hookbrawl!.getState().players.some((p) => !p.isBot && p.items.grapple.kind === 'owned'));

    const target = await page.evaluate(() => {
      const hb = window.__hookbrawl!;
      const { arena } = hb.getState();
      return hb.worldToScreen({ x: arena.canal.x1 + 200, y: arena.height / 2 - 120 });
    });
    await page.mouse.move(target.x, target.y);
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => window.__hookbrawl!.getState().grapples.length > 0);
    const grappling = await worstUntil(page, (s) => s.grapples.length === 0);
    // Set down on the far dock the player is staggered for a moment, and a hook asked for then is not thrown.
    await page.waitForFunction(() => {
      const hb = window.__hookbrawl!;
      return hb.getState().players.find((p) => p.id === hb.getLocalPlayerId())!.status.kind === 'alive';
    });

    const dummy = await page.evaluate(() => {
      const hb = window.__hookbrawl!;
      return hb.worldToScreen(hb.getState().players.find((p) => p.team === 'east')!.pos);
    });
    await page.mouse.move(dummy.x, dummy.y);
    await page.keyboard.press('Space');
    // Below what the hook alone takes, so the two are trading blows.
    const struck = TUNING.maxHp - TUNING.hookDamage;
    await page.waitForFunction((hp) => window.__hookbrawl!.getState().players.some((p) => p.team === 'east' && p.hp < hp), struck, { timeout: 8_000 });
    // Long enough to catch the slash, sparks and number of several blows in a row.
    const fightUntil = Date.now() + 1_500;
    const brawling = await worstUntil(page, () => Date.now() > fightUntil);

    for (const [moment, stats] of [['grapple', grappling], ['brawl', brawling]] as const) {
      expect(stats.calls, `${moment} draw calls`).toBeGreaterThan(0);
      expect(stats.calls, `${moment} draw calls`).toBeLessThanOrEqual(BUDGET.calls);
      expect(stats.triangles, `${moment} triangles`).toBeLessThanOrEqual(BUDGET.triangles);
    }
    test.info().annotations.push({ type: 'draw cost', description: JSON.stringify({ scene, grappling, brawling }) });
  });
}

const VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
  { width: 800, height: 600 },
  { width: 390, height: 844 },
] as const;

async function boxOf(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox();
  if (box === null) throw new Error(`${selector} is not laid out`);
  return box;
}

async function checkLayout(page: Page, width: number, height: number): Promise<void> {
  const shop = await boxOf(page, '.hud-shop');
  const panel = await boxOf(page, '.hud-panel');
  const aside = await boxOf(page, '.hud-aside');
  const overlaps = (a: typeof shop, b: typeof shop) =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  expect(overlaps(shop, panel) || overlaps(shop, aside) || overlaps(panel, aside)).toBe(false);
  for (const box of [shop, panel, aside]) expect(box.x + box.width).toBeLessThanOrEqual(width);
  if (width >= 1280) for (const box of [shop, panel, aside]) expect(box.y).toBeGreaterThanOrEqual(height - HUD_BAND);
  const slots = await page.locator('.hud-slot').all();
  expect(slots).toHaveLength(SHOP_SLOTS.length);
  for (const slot of slots) {
    const box = await slot.boundingBox();
    expect(box !== null && box.x >= shop.x && box.x + box.width <= shop.x + shop.width).toBe(true);
  }
}

for (const { width, height } of VIEWPORTS) {
  test(`HUD screenshots at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await boot(page, '?opponent=idle');
    await page.waitForTimeout(300);
    await checkLayout(page, width, height);
    await page.screenshot({ path: `${SHOT_DIR}/m2-ui-${width}x${height}-a-start.png` });

    await boot(page, '?gold=2300&opponent=idle');
    for (const key of ['Digit1', 'Digit1', 'Digit1', 'Digit1', 'Digit5', 'Digit2', 'Digit2']) {
      await page.keyboard.press(key);
      await page.waitForTimeout(80);
    }
    await expect.poll(async () => (await snapshot(page)).me.upgrades.range).toBe(1);
    await page.waitForTimeout(200);
    await checkLayout(page, width, height);
    await page.screenshot({ path: `${SHOT_DIR}/m2-ui-${width}x${height}-b-mix.png` });

    await page.keyboard.press('KeyE');
    await waitForGrappleCooldown(page);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${SHOT_DIR}/m2-ui-${width}x${height}-c-cooldown.png` });
  });
}
