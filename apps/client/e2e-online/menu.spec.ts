import { expect, test } from '@playwright/test';
import { close, createRoom, DESKTOP, player } from './helpers';

test.use({ viewport: DESKTOP });

/** The menu appears once the models have loaded, which software WebGL on a busy machine takes its time over. */
const PAGE_LOAD_MS = 30_000;

test('Enter in the name field on With friends creates a room, and the tab is open again next visit', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'With friends' }).click({ timeout: PAGE_LOAD_MS });
  await page.getByLabel('Your name').fill('Ada');
  await page.getByLabel('Your name').press('Enter');
  await expect(page.getByRole('heading', { name: 'Lobby' })).toBeVisible();
  await expect(page.locator('.room-code strong')).toHaveText(/^[A-Z2-9]{6}$/);

  await page.getByRole('button', { name: 'Menu' }).click();
  await expect(page.getByRole('tab', { name: 'With friends' })).toHaveAttribute('aria-selected', 'true');
});

test('from a share link, Enter in the name field joins the room', async ({ browser }) => {
  const host = await player(browser);
  const code = await createRoom(host, 'Ada');
  const guest = await player(browser);
  await guest.goto(`/?room=${code}`);
  await expect(guest.getByRole('button', { name: 'Join', exact: true })).toHaveClass(/hud-primary/, { timeout: PAGE_LOAD_MS });
  await expect(guest.getByLabel('Your name')).toBeFocused();
  await guest.keyboard.type('Bo');
  await guest.keyboard.press('Enter');
  await expect(guest.getByRole('heading', { name: 'Lobby' })).toBeVisible();
  await expect(host.locator('.team-east .slot-human')).toContainText('Bo');
  await close(host, guest);
});
