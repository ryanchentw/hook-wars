import { expect, test, type Page } from '@playwright/test';
import { ECONOMY, hookStats, ITEMS, TUNING } from '@hookbrawl/sim';
import type { GameState, Hook, Player, Vec2 } from '@hookbrawl/sim';

const SHOT_DIR = 'test-results';
const SLACK = 1e-6;
/** Where the thrower stands: at the canal's edge, far enough north that a throw past the dummy clears the buoy. */
const STAND = { x: 950, y: 550 } as const;
/** How far north of the dummy the outgoing hook passes: clear of its reach, so only the return can catch it. */
const PASS_BY = 100;
/** Screen pixels around a point of interest; the scene stays at the game's own camera distance. */
const CLIP = { width: 240, height: 180 } as const;
const AIM_AHEAD = 400;

type Png = Awaited<ReturnType<Page['screenshot']>>;

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

async function boot(page: Page, query: string): Promise<void> {
  await page.goto(`/${query}`);
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

async function buy(page: Page, key: string, owned: (me: Player) => boolean): Promise<void> {
  await page.keyboard.press(key);
  await expect.poll(async () => owned((await snapshot(page)).me)).toBe(true);
}

const ownsBarb = (me: Player): boolean => me.items.barb.kind === 'owned';

async function walkToStand(page: Page): Promise<Vec2> {
  const { pos } = (await snapshot(page)).me;
  if (pos.x < STAND.x) await holdUntil(page, 'KeyD', 'x', STAND.x);
  if (pos.y > STAND.y) await holdUntil(page, 'ArrowUp', 'y', STAND.y);
  await page.waitForTimeout(100);
  return (await snapshot(page)).me.pos;
}

async function localHook(page: Page): Promise<Hook | null> {
  return page.evaluate(() => {
    const hb = window.__hookbrawl!;
    return hb.getState().hooks.find((h) => h.ownerId === hb.getLocalPlayerId()) ?? null;
  });
}

/** Throws from where the player stands toward `target`, aiming a short way along that line so the cursor stays on screen. */
async function throwToward(page: Page, from: Vec2, target: Vec2): Promise<void> {
  const length = Math.hypot(target.x - from.x, target.y - from.y);
  const ahead = { x: from.x + ((target.x - from.x) / length) * AIM_AHEAD, y: from.y + ((target.y - from.y) / length) * AIM_AHEAD };
  const aim = await toScreen(page, ahead);
  await page.mouse.move(aim.x, aim.y);
  await page.keyboard.press('Space');
  await expect.poll(() => localHook(page)).not.toBeNull();
}

async function waitForHook(page: Page, done: (hook: Hook | null) => boolean, timeout = 6_000): Promise<Hook | null> {
  const until = Date.now() + timeout;
  for (;;) {
    const hook = await localHook(page);
    if (done(hook)) return hook;
    if (Date.now() > until) throw new Error('the hook never reached the awaited moment');
    await page.waitForTimeout(10);
  }
}

/** A whole frame and the screen point to centre a crop on. */
type Framed = { readonly png: Png; readonly centre: Vec2 };

/** Long enough for the renderer to draw the held state. */
const SETTLE_MS = 150;

async function frameAround(page: Page, at: () => Promise<Vec2 | null>): Promise<Framed> {
  await page.evaluate(() => window.__hookbrawl!.setPaused(true));
  await page.waitForTimeout(SETTLE_MS);
  const point = await at();
  if (point === null) throw new Error('nothing to frame');
  const png = await page.screenshot();
  const centre = await toScreen(page, point);
  await page.evaluate(() => window.__hookbrawl!.setPaused(false));
  return { png, centre };
}

const localPos = (page: Page) => async (): Promise<Vec2> => (await snapshot(page)).me.pos;
const hookPos = (page: Page) => async (): Promise<Vec2 | null> => (await localHook(page))?.pos ?? null;

/** Replaces the page with two crops side by side, so a plain hook and a barbed one can be judged at the same size. */
async function sideBySide(page: Page, left: Framed, right: Framed, labels: readonly [string, string], path: string): Promise<void> {
  const cell = ({ png, centre }: Framed, label: string) =>
    `<figure style="margin:0"><div style="width:${CLIP.width}px;height:${CLIP.height}px;background:url(data:image/png;base64,${png.toString('base64')}) ${CLIP.width / 2 - centre.x}px ${CLIP.height / 2 - centre.y}px no-repeat"></div><figcaption>${label}</figcaption></figure>`;
  await page.setContent(
    `<body style="margin:0;display:flex;gap:12px;background:#111;color:#ddd;font:13px sans-serif">${cell(left, labels[0])}${cell(right, labels[1])}</body>`,
  );
  await page.screenshot({ path, clip: { x: 0, y: 0, width: CLIP.width * 2 + 12, height: CLIP.height + 28 } });
}

test('6 buys the barb, the slot and the hook panel show it, and the next hook is cast barbed', async ({ page }) => {
  await boot(page, '?gold=2000&opponent=idle');
  const before = await snapshot(page);
  await buy(page, 'Digit6', ownsBarb);
  const after = await snapshot(page);
  expect(after.me.items.barb).toEqual({ kind: 'owned' });
  expect(after.me.gold).toBe(before.me.gold - ITEMS.barb.cost + passiveBetween(before.time, after.time));
  await expect(page.getByRole('button', { name: /^Barb, owned$/ })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Barbed hook' })).toBeVisible();

  await throwToward(page, after.me.pos, after.dummy.pos);
  expect((await localHook(page))?.stats.barbed).toBe(true);
});

/**
 * Throws just past the dummy, then walks south until the hook is home or has caught, so the return line swings across it.
 * A catch pauses the sim on the frame it happens, inside the page, so a screenshot can show the latch itself.
 */
async function throwAndWalkSouth(page: Page): Promise<void> {
  const from = await walkToStand(page);
  const { dummy } = await snapshot(page);
  await throwToward(page, from, { x: dummy.pos.x, y: dummy.pos.y - PASS_BY });
  await page.keyboard.down('KeyS');
  await page.waitForFunction(
    () => {
      const hb = window.__hookbrawl!;
      const s = hb.getState();
      const caught = s.players.some((p) => p.team === 'east' && p.status.kind === 'dragged');
      if (caught) hb.setPaused(true);
      return caught || s.hooks.length === 0;
    },
    undefined,
    { timeout: 6_000, polling: 'raf' },
  );
  await page.keyboard.up('KeyS');
}

test('a barbed hook that missed on the way out catches the dummy on the way back and sets it down on the west dock', async ({ page }) => {
  await boot(page, '?gold=2000&opponent=idle');
  await buy(page, 'Digit6', ownsBarb);
  await throwAndWalkSouth(page);
  const latched = await snapshot(page);
  expect(latched.dummy.status.kind).toBe('dragged');
  expect(latched.dummy.hp).toBe(TUNING.maxHp - hookStats(latched.me).damage);
  await page.waitForTimeout(SETTLE_MS);
  await page.screenshot({ path: `${SHOT_DIR}/barb-return-catch.png` });
  await page.evaluate(() => window.__hookbrawl!.setPaused(false));

  await waitForHook(page, (h) => h === null);
  const home = await snapshot(page);
  expect(home.dummy.pos.x).toBeLessThan(home.state.arena.canal.x0);
  expect(['staggered', 'alive']).toContain(home.dummy.status.kind);
  // The thrower's swing is ready the moment a catch lands, so the hook's damage may already have a blow on top.
  expect(home.dummy.hp).toBeLessThanOrEqual(latched.dummy.hp);
});

test('an unbarbed hook on the same path catches nothing', async ({ page }) => {
  await boot(page, '?opponent=idle');
  await throwAndWalkSouth(page);
  const home = await snapshot(page);
  expect(home.state.hooks).toEqual([]);
  expect(home.dummy).toMatchObject({ hp: TUNING.maxHp, status: { kind: 'alive' } });
  expect(home.dummy.pos.x).toBeGreaterThan(home.state.arena.canal.x1);
});

/** Throws east and frames the head mid-flight out, then on its way back while the thrower stands still. */
async function frameFlight(page: Page): Promise<{ out: Framed; back: Framed }> {
  const from = await walkToStand(page);
  await throwToward(page, from, { x: from.x + AIM_AHEAD, y: from.y });
  await waitForHook(page, (h) => h !== null && h.pos.x >= from.x + AIM_AHEAD);
  const out = await frameAround(page, hookPos(page));
  await waitForHook(page, (h) => h !== null && h.phase.kind === 'retracting' && h.pos.x <= from.x + 2 * AIM_AHEAD);
  const back = await frameAround(page, hookPos(page));
  await waitForHook(page, (h) => h === null);
  return { out, back };
}

test('barb screenshots: hook in hand, in flight and on the way back, plain beside barbed', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await boot(page, '?gold=2000&opponent=idle');
  await page.waitForTimeout(300);
  const plainHand = await frameAround(page, localPos(page));
  const plain = await frameFlight(page);

  await buy(page, 'Digit6', ownsBarb);
  await page.waitForTimeout(TUNING.hookCooldown * 1000);
  const barbedHand = await frameAround(page, localPos(page));
  const barbed = await frameFlight(page);

  await sideBySide(page, plainHand, barbedHand, ['plain in hand', 'barbed in hand'], `${SHOT_DIR}/barb-hand.png`);
  await sideBySide(page, plain.out, barbed.out, ['plain, outgoing', 'barbed, outgoing'], `${SHOT_DIR}/barb-flight.png`);
  await sideBySide(page, plain.back, barbed.back, ['plain, returning: spent', 'barbed, returning: hot'], `${SHOT_DIR}/barb-returning.png`);
});

/** Leaves the barb owned, damage maxed, the grapple affordable and the other upgrades just out of reach. */
const MIX_GOLD = 2380;
const MIX_KEYS = ['Digit6', 'Digit1', 'Digit1', 'Digit1', 'Digit1'] as const;

for (const { width, height } of [
  { width: 1280, height: 720 },
  { width: 390, height: 844 },
] as const) {
  test(`barb strip at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await boot(page, `?gold=${MIX_GOLD}&opponent=idle`);
    for (const key of MIX_KEYS) {
      await page.keyboard.press(key);
      await page.waitForTimeout(80);
    }
    await expect.poll(async () => (await snapshot(page)).me.upgrades.damage).toBe(4);
    await expect(page.locator('.hud-slot')).toHaveCount(6);
    await expect(page.getByRole('button', { name: /^Barb, owned$/ })).toBeVisible();
    await page.waitForTimeout(1_200);
    await page.screenshot({ path: `${SHOT_DIR}/barb-strip-${width}x${height}.png` });
  });
}
