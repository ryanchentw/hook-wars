import { expect, test, type Page } from '@playwright/test';
import { close, createRoom, DESKTOP, EAST, joinByLink, matchUp, player, posOf, SHOT_DIR, startDuel, walkUntil } from './helpers';

test.use({ viewport: DESKTOP });

const GRAPPLE_KEY = 'Digit5';
const STARTING_GOLD = 150;
const PHONE = { width: 390, height: 844 };
/** The widest name a player may pick: 16 of the widest letter. */
const LONG_NAME = 'WWWWWWWWWWWWWWWW';

const goldOf = (page: Page, id: string): Promise<number | null> => page.evaluate((playerId) => window.__hookbrawl!.getView().players.find((p) => p.id === playerId)?.gold ?? null, id);

test('a dropped player sees a countdown, is played by a bot, and gets the fighter back on reconnecting', async ({ browser }) => {
  const { host, guest } = await startDuel(browser);
  await guest.locator('#stage').focus();
  // A purchase is the server's to grant: the HUD says so only once the server has.
  await guest.keyboard.press(GRAPPLE_KEY);
  await expect(guest.locator('.hud-announcer')).toHaveText(/Bought Grapple/);
  const gold = (await goldOf(guest, EAST))!;
  expect(gold).toBeLessThan(STARTING_GOLD);

  await guest.evaluate(() => {
    window.__hookbrawlNet!.block(true);
    window.__hookbrawlNet!.drop();
  });
  const status = guest.locator('.net-status');
  await expect(status).toContainText('Connection lost. Reconnecting');
  await expect(status).toContainText(/\d+ s left/);
  // The bot standing in walks the fighter; the host sees it move with nobody at the keys.
  const left = (await posOf(host, EAST))!;
  await expect.poll(async () => Math.hypot((await posOf(host, EAST))!.x - left.x, (await posOf(host, EAST))!.y - left.y), { timeout: 15_000 }).toBeGreaterThan(40);
  await guest.screenshot({ path: `${SHOT_DIR}/m4-reconnecting.png` });

  await guest.evaluate(() => window.__hookbrawlNet!.block(false));
  await expect(status).toContainText('Online', { timeout: 15_000 });
  await expect(guest.locator('.hud-score')).toBeVisible();
  // The bot that stood in spent nothing: the purse has only grown, and the grapple bought before the drop is still owned.
  expect(await goldOf(guest, EAST)).toBeGreaterThanOrEqual(gold);
  expect(await guest.evaluate((id) => window.__hookbrawl!.getView().players.find((p) => p.id === id)!.items.grapple.kind, EAST)).toBe('owned');
  expect(await guest.evaluate((id) => window.__hookbrawl!.getView().players.find((p) => p.id === id)!.upgrades, EAST)).toEqual({ damage: 0, range: 0, speed: 0, size: 0 });

  // The keys are the player's again, and the other page sees it.
  const back = (await posOf(guest, EAST))!;
  await walkUntil(guest, ['KeyW'], EAST, (pos) => pos.y <= back.y - 60 || pos.y <= 40);
  await expect.poll(async () => Math.abs((await posOf(host, EAST))!.y - (await posOf(guest, EAST))!.y), { timeout: 10_000 }).toBeLessThan(1);
  await close(host, guest);
});

test('a dropped player is shown as (bot) over their fighter and on the scoreboard until they take it back', async ({ browser }) => {
  const { host, guest } = await startDuel(browser, { guestName: LONG_NAME });
  const label = host.locator('.unit-name', { hasText: LONG_NAME });
  const row = host.getByRole('region', { name: 'Scoreboard' }).locator('tbody th[scope="row"]', { hasText: LONG_NAME });
  await host.getByRole('button', { name: 'Scores' }).click();
  await expect(label).toHaveText(LONG_NAME);
  await expect(row).toHaveText(LONG_NAME);

  await guest.evaluate(() => {
    window.__hookbrawlNet!.block(true);
    window.__hookbrawlNet!.drop();
  });
  await expect(label).toHaveText(`${LONG_NAME} (bot)`, { timeout: 15_000 });
  await expect(row).toHaveText(`${LONG_NAME} (bot)`);
  await expect(label).toBeVisible();
  await host.screenshot({ path: `${SHOT_DIR}/botname-online-dropped.png` });
  await host.setViewportSize(PHONE);
  await expect(label).toBeVisible();
  const board = (await host.getByRole('region', { name: 'Scoreboard' }).boundingBox())!;
  const table = (await host.getByRole('region', { name: 'Scoreboard' }).locator('table').boundingBox())!;
  expect(table.x + table.width).toBeLessThanOrEqual(board.x + board.width + 0.5);
  const labelBox = (await label.boundingBox())!;
  expect(labelBox.x).toBeGreaterThanOrEqual(0);
  expect(labelBox.x + labelBox.width).toBeLessThanOrEqual(PHONE.width);
  expect(await host.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(PHONE.width);
  await host.screenshot({ path: `${SHOT_DIR}/botname-online-dropped-phone.png` });
  await host.setViewportSize(DESKTOP);

  await guest.evaluate(() => window.__hookbrawlNet!.block(false));
  await expect(guest.locator('.net-status')).toContainText('Online', { timeout: 15_000 });
  await expect(label).toHaveText(LONG_NAME, { timeout: 5_000 });
  await expect(row).toHaveText(LONG_NAME);
  await close(host, guest);
});

test('a reload inside the window comes straight back to the match', async ({ browser }) => {
  const { host, guest } = await startDuel(browser);
  await guest.reload();
  await matchUp(guest);
  await expect(guest.locator('.net-status')).toContainText('Online');
  expect(await guest.evaluate(() => window.__hookbrawl!.getLocalPlayerId())).toBe(EAST);
  await close(host, guest);
});

test('after the match both are back in the same lobby, and the host starts the rematch', async ({ browser }) => {
  test.setTimeout(420_000);
  const [host, guest] = [await player(browser), await player(browser)];
  const code = await createRoom(host, 'Ada');
  await joinByLink(guest, code, 'Bo');
  await expect(host.locator('.team-east .slot-human')).toContainText('Bo');
  await host.getByLabel('Kills to win').selectOption('5');
  await host.getByRole('button', { name: 'Fill with bots' }).click();
  await host.getByRole('button', { name: 'Start match' }).click();
  await Promise.all([matchUp(host), matchUp(guest)]);

  const over = (page: Page) => page.getByRole('dialog', { name: 'match over' });
  await expect(over(host)).toBeVisible({ timeout: 360_000 });
  await expect(over(guest)).toBeVisible({ timeout: 10_000 });
  await expect(over(guest).getByRole('button', { name: 'Rematch' })).toHaveCount(0);
  await expect(over(guest)).toContainText('The host can start a rematch.');

  await over(guest).getByRole('button', { name: 'Back to lobby' }).click();
  await expect(guest.getByRole('heading', { name: 'Lobby' })).toBeVisible();
  await expect(guest.locator('.slot-human')).toHaveCount(2);
  await expect(guest.locator('.slot-bot')).toHaveCount(4);

  const first = await host.evaluate(() => window.__hookbrawl!.sceneId());
  await over(host).getByRole('button', { name: 'Rematch' }).click();
  // The finished match is still on the host's screen until the new one is drawn; only the new one is being played.
  const playing = (page: Page) => page.waitForFunction(() => window.__hookbrawl?.getView().phase.kind === 'playing' && window.__hookbrawl.getView().tick > 0, null, { timeout: 45_000 });
  await Promise.all([playing(host), playing(guest)]);
  expect(await guest.evaluate(() => window.__hookbrawl!.sceneId())).not.toBe(first);
  expect(await guest.evaluate(() => window.__hookbrawl!.getLocalPlayerId())).toBe(EAST);
  await expect(over(host)).toBeHidden();
  await close(host, guest);
});
