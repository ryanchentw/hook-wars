import { expect, test } from '@playwright/test';
import { close, createRoom, DESKTOP, joinByLink, player, SHOT_DIR } from './helpers';

test.use({ viewport: DESKTOP });

test('the menu offers offline play, a new room and a room code', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Your name').fill('Ada');
  await expect(page.getByRole('button', { name: 'Play offline' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create a room' })).toBeVisible();
  await expect(page.getByLabel('Room code')).toBeVisible();
  await page.screenshot({ path: `${SHOT_DIR}/m4-menu.png` });
});

test('two players share one lobby: seats change live, and only the host has the controls', async ({ browser }) => {
  const [host, guest] = [await player(browser), await player(browser)];
  const code = await createRoom(host, 'Ada');
  await expect(host).toHaveURL(new RegExp(`\\?room=${code}#/lobby$`));
  await joinByLink(guest, code, 'Bo');

  await expect(host.locator('.team-east .slot-human')).toContainText('Bo');
  await expect(guest.locator('.team-west .slot-human')).toContainText('Ada');
  await expect(guest.locator('.team-west .slot-human')).toContainText('host');
  await expect(guest.locator('.room-code strong')).toHaveText(code);

  await expect(guest.getByLabel('Scene')).toBeDisabled();
  await expect(guest.getByLabel('Fog of war')).toBeDisabled();
  await expect(guest.getByRole('button', { name: 'Start match' })).toBeDisabled();
  await expect(guest.getByText('The host starts the match.')).toBeVisible();
  await expect(guest.getByRole('button', { name: /Add bot/ })).toHaveCount(0);

  await host.getByLabel('Kills to win').selectOption('5');
  await expect(guest.getByLabel('Kills to win')).toHaveValue('5');
  await host.getByRole('button', { name: 'Add bot in East Side slot 2' }).click();
  await expect(guest.locator('.team-east .slot-bot')).toHaveCount(1);
  await guest.getByRole('button', { name: 'Sit here in West Side slot 3' }).click();
  await expect(host.locator('.team-west .slot-human')).toHaveCount(2);

  await Promise.all([host.screenshot({ path: `${SHOT_DIR}/m4-lobby-host.png` }), guest.screenshot({ path: `${SHOT_DIR}/m4-lobby-guest.png` })]);
  await close(host, guest);
});

test('the copy-link control puts the share link on the clipboard and says so', async ({ browser }) => {
  const context = await browser.newContext({ viewport: DESKTOP, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  const code = await createRoom(page, 'Ada');
  await page.getByRole('button', { name: 'Copy link' }).click();
  await expect(page.locator('.room-tip')).toHaveText(/Copied/);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(new RegExp(`/\\?room=${code}$`));
  await context.close();
});

test('the host leaving hands the room to the other player', async ({ browser }) => {
  const [host, guest] = [await player(browser), await player(browser)];
  const code = await createRoom(host, 'Ada');
  await joinByLink(guest, code, 'Bo');
  await expect(guest.getByRole('button', { name: 'Start match' })).toBeDisabled();
  await host.getByRole('button', { name: 'Menu' }).click();
  await expect(host.getByRole('button', { name: 'Play offline' })).toBeVisible();
  await expect(host).not.toHaveURL(/room=/);
  await expect(guest.locator('.team-east .slot-human')).toContainText('host');
  await expect(guest.locator('.team-west .slot-human')).toHaveCount(0);
  await expect(guest.getByLabel('Scene')).toBeEnabled();
  await close(host, guest);
});

test.describe('trouble getting in', () => {
  test('a code that is not a code is caught before anything is sent', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Your name').fill('Ada');
    await page.getByLabel('Room code').fill('abc');
    await page.getByRole('button', { name: 'Join room' }).click();
    await expect(page.locator('.join-error')).toHaveText(/six letters and digits/);
    await expect(page.getByLabel('Room code')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel('Room code')).toBeFocused();
  });

  test('a code no room has says so, and leaves the player on the menu with the ways on', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Your name').fill('Ada');
    await page.getByLabel('Room code').fill('zzzzzz');
    await page.getByRole('button', { name: 'Join room' }).click();
    await expect(page.getByRole('alert')).toHaveText(/No room has that code/);
    await expect(page.getByRole('button', { name: 'Create a room' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Play offline' })).toBeEnabled();
    await expect(page).not.toHaveURL(/room=/);
    await page.screenshot({ path: `${SHOT_DIR}/m4-error.png` });
  });

  test('a name already in the room is refused, and one more press with another name gets in', async ({ browser }) => {
    const [host, guest] = [await player(browser), await player(browser)];
    const code = await createRoom(host, 'Ada');
    await joinByLink(guest, code, 'ada');
    await expect(guest.getByRole('alert')).toHaveText(/already has that name/);
    await expect(guest.getByLabel('Room code')).toHaveValue(code);
    await guest.getByLabel('Your name').fill('Bo');
    await guest.getByRole('button', { name: 'Join room' }).click();
    await expect(guest.getByRole('heading', { name: 'Lobby' })).toBeVisible();
    await close(host, guest);
  });

  test('a full room is refused', async ({ browser }) => {
    const host = await player(browser);
    const code = await createRoom(host, 'Ada');
    await host.getByRole('button', { name: 'Fill with bots' }).click();
    const late = await player(browser);
    await joinByLink(late, code, 'Bo');
    await expect(late.getByRole('alert')).toHaveText(/room is full/);
    await close(host, late);
  });

  test('a server that is down says so and offers offline play', async ({ page }) => {
    await page.routeWebSocket('/ws', (socket) => socket.close());
    await page.goto('/');
    await page.getByLabel('Your name').fill('Ada');
    await page.getByRole('button', { name: 'Create a room' }).click();
    await expect(page.getByRole('alert')).toHaveText(/server cannot be reached/);
    await page.getByRole('button', { name: 'Play offline' }).click();
    await expect(page.getByRole('heading', { name: 'Lobby' })).toBeVisible();
    await expect(page.locator('.room-code')).toHaveCount(0);
  });
});
