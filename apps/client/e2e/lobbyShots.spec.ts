import { expect, test, type Page } from '@playwright/test';

const SHOT_DIR = 'test-results';
const DESKTOP = { width: 1280, height: 720 };
const PHONE = { width: 390, height: 844 };
/** The menu draws over a scene still loading; this lets its establishing view settle so the shot is the one a player sees. */
const SETTLE_MS = 1500;

async function enterLobby(page: Page, menuShot: string | null): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Your name').fill('Ryan');
  await page.waitForTimeout(SETTLE_MS);
  if (menuShot !== null) await page.screenshot({ path: `${SHOT_DIR}/${menuShot}.png` });
  await page.getByRole('button', { name: 'Play' }).click();
  await expect(page.getByRole('heading', { name: 'Lobby' })).toBeFocused();
}

/** Neither the page nor anything in it is wider than the viewport. */
async function noSideScroll(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await page.locator('.lobby').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
}

test('the offline lobby, empty and full, on a laptop', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await enterLobby(page, 'tidy-menu');
  await noSideScroll(page);
  await page.screenshot({ path: `${SHOT_DIR}/tidy-lobby-offline-empty.png` });
  await page.getByRole('button', { name: 'Fill with bots' }).click();
  await expect(page.locator('.slot-bot')).toHaveCount(5);
  await page.mouse.move(0, 0);
  await noSideScroll(page);
  await page.screenshot({ path: `${SHOT_DIR}/tidy-lobby-offline-full.png` });
});

test('the offline lobby on a phone fits without sideways scrolling', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await enterLobby(page, null);
  await noSideScroll(page);
  await page.screenshot({ path: `${SHOT_DIR}/tidy-lobby-offline-phone.png`, fullPage: true });
});
