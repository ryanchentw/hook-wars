import { expect, test, type Page } from '@playwright/test';
import { ECONOMY, EFFECTS, PICKUPS, TUNING } from '@hookwars/sim';
import type { GameState, PickupKind, PickupSpawn, Player } from '@hookwars/sim';

const SHOT_DIR = 'test-results';
const DESKTOP = { width: 1280, height: 720 };
const SLACK = 1e-6;
/** Short of the far bank and clear of the buoy, so a throw from the west spawn never glances off it. */
const NEAR_LANE = 1090;
/** Sim units along the throw at which the cursor is put, so it stays on screen. */
const AIM_AHEAD = 400;
const SETTLE_MS = 200;

type Snapshot = { readonly time: number; readonly me: Player; readonly dummies: readonly Player[]; readonly state: GameState };

async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => {
    const hb = window.__hookwars!;
    const state = hb.getState();
    const me = state.players.find((p) => p.id === hb.getLocalPlayerId())!;
    return { time: state.time, me, dummies: state.players.filter((p) => p.team === 'east'), state };
  });
}

async function boot(page: Page, query: string): Promise<void> {
  await page.setViewportSize(DESKTOP);
  await page.goto(`/?pickups=on&opponent=idle&intro=off&${query}`);
  await page.waitForFunction(() => window.__hookwars !== undefined);
}

const spawn = (page: Page, s: PickupSpawn): Promise<void> => page.evaluate((x) => window.__hookwars!.spawnPickup(x), s);

/** Lets the pickup float `seconds` on in one go, so it is out on the water in front of the thrower. */
const floatOn = (page: Page, seconds: number): Promise<void> => page.evaluate((s) => window.__hookwars!.fastForward(s), seconds);

const passiveBetween = (t0: number, t1: number): number => ECONOMY.passiveGold * (Math.floor(t1 + SLACK) - Math.floor(t0 + SLACK));

/** Throws at the first pickup, leading its drift by the time the hook takes to get there. */
async function throwAtPickup(page: Page): Promise<void> {
  const { me, state } = await snapshot(page);
  const pickup = state.pickups[0]!;
  const lead = (Math.hypot(pickup.pos.x - me.pos.x, pickup.pos.y - me.pos.y) / TUNING.hookSpeed) * PICKUPS.driftSpeed;
  const target = { x: pickup.pos.x, y: pickup.pos.y + (pickup.from === 'north' ? lead : -lead) };
  const length = Math.hypot(target.x - me.pos.x, target.y - me.pos.y);
  const ahead = { x: me.pos.x + ((target.x - me.pos.x) / length) * AIM_AHEAD, y: me.pos.y + ((target.y - me.pos.y) / length) * AIM_AHEAD };
  const aim = await page.evaluate((p) => window.__hookwars!.worldToScreen(p), ahead);
  await page.mouse.move(aim.x, aim.y);
  await page.keyboard.press('Space');
}

/** Waits for the sim to reach `predicate`, holding the match and the picture on that very frame. */
async function freezeWhen(page: Page, predicate: string): Promise<void> {
  await page.waitForFunction(
    (body) => {
      const hb = window.__hookwars!;
      const met = new Function('s', `return ${body}`)(hb.getState()) as boolean;
      if (met) hb.freeze(true);
      return met;
    },
    predicate,
    { timeout: 8_000, polling: 'raf' },
  );
  await page.waitForTimeout(SETTLE_MS);
}

async function unfreeze(page: Page): Promise<void> {
  await page.evaluate(() => window.__hookwars!.freeze(false));
}

const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOT_DIR}/pickup-${name}.png` });

/**
 * Hooks a fresh `kind` pickup floating in front of the thrower and holds the frame where it has reached the hand.
 * Waits on what lasts (the pickup gone, the hook home), not on the one-tick event, which a slow frame can step past.
 */
async function hookAndCollect(page: Page, kind: PickupKind, carriedShot: string | null): Promise<void> {
  const id = `p${(await snapshot(page)).state.nextPickupSeq}`;
  await spawn(page, { kind, from: 'north', lane: NEAR_LANE });
  await floatOn(page, 12);
  await throwAtPickup(page);
  if (carriedShot !== null) {
    await freezeWhen(page, "s.pickups.some((p) => p.state.kind === 'carried') && s.hooks.some((h) => h.pos.x < 860)");
    await shot(page, carriedShot);
    await unfreeze(page);
  }
  await freezeWhen(page, `!s.pickups.some((p) => p.id === '${id}') && s.hooks.length === 0`);
}

test.describe.configure({ mode: 'serial' });

test('each kind drifts down the water, glowing in its own colour, on every scene', async ({ page }) => {
  for (const scene of ['harbour', 'victoria', 'golden-gate', 'daan']) {
    await boot(page, `scene=${scene}`);
    await spawn(page, { kind: 'gold', from: 'north', lane: 1100 });
    await spawn(page, { kind: 'gale', from: 'south', lane: 1300 });
    await floatOn(page, 4);
    await spawn(page, { kind: 'storm', from: 'north', lane: 1180 });
    await floatOn(page, 8);
    const { state } = await snapshot(page);
    expect(state.pickups.slice(0, 3).map((p) => p.kind)).toEqual(['gold', 'gale', 'storm']);
    await page.waitForTimeout(SETTLE_MS * 3);
    await shot(page, `drifting-${scene}`);
  }
});

test('hooking a Gold pickup pays its gold, pops the amount and puts a line in the feed', async ({ page }) => {
  await boot(page, 'scene=harbour');
  const before = await snapshot(page);
  await hookAndCollect(page, 'gold', 'carried');
  const after = await snapshot(page);
  expect(after.me.gold - before.me.gold).toBe(PICKUPS.gold + passiveBetween(before.time, after.time));
  expect(after.me.earned - before.me.earned).toBe(PICKUPS.gold + passiveBetween(before.time, after.time));
  await unfreeze(page);
  await page.waitForTimeout(250);
  await expect(page.locator('.gold-pop')).toHaveText(`+${PICKUPS.gold}`);
  await shot(page, 'gold-pop');
  await expect(page.locator('.hud-feed li').first()).toHaveText(`You took the Gold +${PICKUPS.gold}`);
  await page.screenshot({ path: `${SHOT_DIR}/pickup-feed-line.png`, clip: { x: 760, y: 0, width: 520, height: 160 } });
});

test('hooking a Gale wraps the fighter in wind and shows its time left by the hp bar', async ({ page }) => {
  await boot(page, 'scene=victoria');
  await hookAndCollect(page, 'gale', null);
  await unfreeze(page);
  await expect(page.locator('.hud-effect')).toContainText('Gale');
  await expect(page.locator('.hud-effect')).toContainText(`${EFFECTS.gale.duration}s`);
  await page.keyboard.down('KeyS');
  await page.waitForTimeout(600);
  await page.evaluate(() => window.__hookwars!.freeze(true));
  await page.waitForTimeout(SETTLE_MS);
  await shot(page, 'gale');
  await unfreeze(page);
  await page.keyboard.up('KeyS');
});

test('hooking a Storm strikes every enemy for the configured damage over its duration', async ({ page }) => {
  await boot(page, 'scene=golden-gate&roster=1v2');
  await hookAndCollect(page, 'storm', null);
  const struck = await snapshot(page);
  expect(struck.dummies.every((d) => d.effects.some((e) => e.kind === 'storm'))).toBe(true);
  await unfreeze(page);
  await freezeWhen(page, `s.players.some((p) => p.team === 'east' && p.hp < ${TUNING.maxHp})`);
  await shot(page, 'storm');
  await unfreeze(page);
  await floatOn(page, EFFECTS.storm.duration + 1);
  const { dummies } = await snapshot(page);
  const spec = EFFECTS.storm.pulse!;
  const total = Math.round(EFFECTS.storm.duration / spec.interval) * spec.damage;
  dummies.forEach((d) => expect(d.hp).toBe(TUNING.maxHp - total));
  await expect(page.locator('.hud-feed li').first()).toHaveText('You took the Storm');
});

async function startFromLobby(page: Page, pickups: boolean): Promise<Snapshot> {
  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  await page.getByLabel('Your name').fill('Ryan');
  await page.getByRole('button', { name: 'Play' }).click();
  const toggle = page.getByRole('switch', { name: 'River pickups' });
  await expect(toggle).toBeChecked();
  if (pickups) await shot(page, 'lobby-switch');
  else await toggle.click();
  await expect(toggle).toBeChecked({ checked: pickups });
  await page.getByRole('button', { name: 'Add a bot to East Side' }).click();
  await page.getByRole('button', { name: 'Start match' }).click();
  await page.waitForFunction(() => window.__hookwars !== undefined);
  return snapshot(page);
}

test('the lobby switch is on by default and reaches the match, and off reaches it too', async ({ page }) => {
  expect((await startFromLobby(page, true)).state.river).not.toBeNull();
  expect((await startFromLobby(page, false)).state.river).toBeNull();
});

test('the direct path leaves pickups off without ?pickups=on', async ({ page }) => {
  await page.goto('/?opponent=idle&intro=off');
  await page.waitForFunction(() => window.__hookwars !== undefined);
  expect((await snapshot(page)).state.river).toBeNull();
});
