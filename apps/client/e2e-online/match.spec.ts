import { expect, test, type Browser, type Page } from '@playwright/test';
import { close, DESKTOP, EAST, posOf, score, SHOT_DIR, startDuel, walkUntil, WEST } from './helpers';

test.use({ viewport: DESKTOP });

/** How far apart two pages may draw a fighter who has stopped: nothing, give or take a float. */
const AGREE = 0.5;
const HOOK_KEY = 'Space';

async function hpOf(page: Page, id: string): Promise<number> {
  return page.evaluate((playerId) => window.__hookbrawl!.getView().players.find((p) => p.id === playerId)!.hp, id);
}

/** How far along the line from thrower to target the cursor is put: near enough the thrower to be on screen whatever the camera shows. */
const AIM_ALONG = 0.3;
const MID_FLIGHT = 400;

/**
 * Throws this page's hook at another fighter. The target may be off screen, so the cursor goes part of the way along
 * the line to them: the ground is drawn in perspective, which keeps straight lines straight, so the aim is the same.
 */
async function hookAt(page: Page, selfId: string, targetId: string): Promise<void> {
  const aim = await page.evaluate(
    ([self, target, along]) => {
      const hook = window.__hookbrawl!;
      const at = (id: string) => hook.worldToScreen(hook.getView().players.find((p) => p.id === id)!.pos);
      const [from, to] = [at(self), at(target)];
      return { x: from.x + (to.x - from.x) * along, y: from.y + (to.y - from.y) * along };
    },
    [selfId, targetId, AIM_ALONG] as const,
  );
  await page.mouse.move(aim.x, aim.y);
  await page.keyboard.press(HOOK_KEY);
}

/**
 * The whole of a two-player match: both walk, each sees the other where they are, one hooks the other across the
 * water and the brawl that follows ends in a kill both pages count the same.
 */
async function playDuel(browser: Browser, query: string, shots: boolean): Promise<void> {
  const { host, guest } = await startDuel(browser, { query });
  // North-east of the buoy, so the throw has a clear line, and inside hook range of the far spawn.
  await walkUntil(host, ['KeyD', 'KeyW'], WEST, (pos) => pos.x >= 930 && pos.y <= 480);
  await walkUntil(guest, ['KeyS'], EAST, (pos) => pos.y >= 760);

  for (const id of [WEST, EAST]) {
    await expect.poll(async () => {
      const [a, b] = [await posOf(host, id), await posOf(guest, id)];
      return a === null || b === null ? Infinity : Math.hypot(a.x - b.x, a.y - b.y);
    }, { timeout: 10_000 }).toBeLessThan(AGREE);
  }

  const before = await hpOf(guest, EAST);
  await hookAt(host, WEST, EAST);
  if (shots) {
    await guest.waitForFunction((far) => window.__hookbrawl!.getView().hooks.some((h) => h.pos.x > 930 + far), MID_FLIGHT);
    await Promise.all([host.screenshot({ path: `${SHOT_DIR}/m4-match-host.png` }), guest.screenshot({ path: `${SHOT_DIR}/m4-match-guest.png` })]);
  }
  await expect.poll(() => hpOf(guest, EAST), { timeout: 15_000 }).toBeLessThan(before);

  await expect(host.locator('.hud-score .hud-points.hud-west')).toHaveText('1', { timeout: 40_000 });
  await expect(guest.locator('.hud-score .hud-points.hud-west')).toHaveText('1', { timeout: 10_000 });
  expect(await score(guest)).toBe(await score(host));
  await expect(host.locator('.hud-feed')).toContainText('Ada decked Bo');
  await expect(guest.locator('.hud-feed')).toContainText('Ada decked Bo');
  await expect(host.locator('.net-status')).toContainText(/Online\s*ping\s*\d+ ms/);
  await close(host, guest);
}

test('two players walk, one hooks the other, and both HUDs agree on the score', async ({ browser }) => {
  await playDuel(browser, '', true);
});

test('the same match plays on a line with 100 ms more round trip and 2 percent loss', async ({ browser }) => {
  await playDuel(browser, 'netlag=100&netloss=2', false);
});

test('the local fighter moves at once, before the server has answered', async ({ browser }) => {
  const { host, guest } = await startDuel(browser, { query: 'netlag=300' });
  await host.locator('#stage').focus();
  const from = (await posOf(host, WEST))!;
  await host.keyboard.down('KeyS');
  // Well inside the 300 ms the server's answer takes to come back.
  await expect.poll(async () => (await posOf(host, WEST))!.y - from.y, { timeout: 250, intervals: [16] }).toBeGreaterThan(8);
  await host.keyboard.up('KeyS');
  await close(host, guest);
});

test('with fog on, a client is never sent the enemy it cannot see', async ({ browser }) => {
  const { host, guest } = await startDuel(browser, { beforeStart: (page) => page.getByLabel('Fog of war').check() });
  const sentEnemy = (page: Page, enemy: string) =>
    page.evaluate((id) => {
      const frames = window.__hookbrawlNet!.received();
      const views = frames.flatMap((m) => (m.t === 'snap' ? [m.view] : m.t === 'matchStart' ? [m.match.view] : []));
      return { snapshots: views.length, withEnemy: views.filter((v) => v.players.some((p) => p.id === id)).length, purses: views.filter((v) => v.roster.some((c) => c.id === id && c.gold !== null)).length };
    }, enemy);

  await guest.waitForFunction(() => window.__hookbrawlNet!.received().filter((m) => m.t === 'snap').length > 60);
  const hidden = await sentEnemy(guest, WEST);
  expect(hidden.snapshots).toBeGreaterThan(60);
  expect(hidden).toMatchObject({ withEnemy: 0, purses: 0 });
  expect((await sentEnemy(host, EAST)).withEnemy).toBe(0);
  expect(await guest.evaluate(() => window.__hookbrawl!.drawnPlayers())).toEqual([EAST]);

  // The same check has teeth: once the two stand at the water's edge, the server does send them to each other.
  await walkUntil(host, ['KeyD'], WEST, (pos) => pos.x >= 960);
  await walkUntil(guest, ['KeyA'], EAST, (pos) => pos.x <= 1440);
  await expect.poll(async () => (await sentEnemy(guest, WEST)).withEnemy).toBeGreaterThan(0);
  expect((await sentEnemy(guest, WEST)).purses).toBe(0);
  await close(host, guest);
});

test('Esc opens a menu that does not stop an online match, and leaving asks first', async ({ browser }) => {
  const { host, guest } = await startDuel(browser);
  const tick = (page: Page): Promise<number> => page.evaluate(() => window.__hookbrawl!.getView().tick);
  await host.keyboard.press('Escape');
  const menu = host.getByRole('dialog', { name: 'Menu' });
  await expect(menu).toContainText('An online match cannot be paused');
  const opened = await tick(host);
  await expect.poll(() => tick(host)).toBeGreaterThan(opened + 30);

  await menu.getByRole('button', { name: 'Leave match' }).click();
  const ask = host.getByRole('dialog', { name: 'Leave the match?' });
  await expect(ask.getByRole('button', { name: 'Stay' })).toBeFocused();
  await ask.getByRole('button', { name: 'Stay' }).click();
  await expect(ask).toBeHidden();
  await expect(host.locator('.hud-score')).toBeVisible();

  await host.goBack();
  await expect(ask).toBeVisible();
  await ask.getByRole('button', { name: 'Leave match' }).click();
  await expect(host.getByRole('button', { name: 'Play offline' })).toBeVisible();
  await expect(host).not.toHaveURL(/room=/);
  // The match goes on for the player who stayed, against a bot in the leaver's place.
  const after = await tick(guest);
  await expect.poll(() => tick(guest)).toBeGreaterThan(after + 30);
  await close(host, guest);
});
