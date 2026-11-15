import { expect, test, type Page } from '@playwright/test';

const SHOT_DIR = 'test-results';
const DESKTOP = { width: 1280, height: 720 };
const LAPTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const NARROW_WIDTHS = [320, 390, 1280] as const;
const INVITE = 'ABC234';
const SCENE_SETTLE_MS = 1000;

async function menuReady(page: Page, query = ''): Promise<void> {
  await page.goto(`/${query}`);
  await expect(page.locator('#stage')).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  await expect(page.getByLabel('Your name')).toBeFocused();
}

const tab = (page: Page, name: string) => page.getByRole('tab', { name });

async function shot(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(SCENE_SETTLE_MS);
  await page.screenshot({ path: `${SHOT_DIR}/menu-${name}.png` });
}

async function openSettings(page: Page, within = page.locator('body')) {
  await within.getByRole('button', { name: 'Settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await expect(settings).toBeVisible();
  return settings;
}

test('the arrow keys move between the two tabs, one Tab stop holds them, and the tab used last opens next time', async ({ page }) => {
  await menuReady(page);
  await expect(tab(page, 'Solo')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();

  await page.keyboard.press('Tab');
  await expect(tab(page, 'Solo')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(tab(page, 'With friends')).toBeFocused();
  await expect(tab(page, 'With friends')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: 'With friends' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeHidden();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Create a room' })).toBeFocused();

  await page.keyboard.press('Shift+Tab');
  await expect(tab(page, 'With friends')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(tab(page, 'Solo')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('End');
  await expect(tab(page, 'With friends')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[role="tab"][tabindex="0"]')).toHaveCount(1);

  await menuReady(page);
  await expect(tab(page, 'With friends')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Home');
  await menuReady(page);
  await expect(tab(page, 'Solo')).toHaveAttribute('aria-selected', 'true');
});

test('a returning player goes in with one Enter: the name is focused and Enter runs the open tab\'s gold button', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await menuReady(page);
  await shot(page, 'solo-empty');
  await page.keyboard.type('Ryan');
  await shot(page, 'solo-name');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Lobby' })).toBeFocused();

  await menuReady(page);
  await expect(page.getByLabel('Your name')).toHaveValue('Ryan');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/lobby$/);
});

test('an action pressed with no name stays pressable, puts the keyboard in the name and says why', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await menuReady(page);
  const play = page.getByRole('button', { name: 'Play', exact: true });
  await expect(play).toBeEnabled();
  await play.click();
  await expect(page.locator('.field-error')).toHaveText(/Enter a name\./);
  await expect(page.getByLabel('Your name')).toBeFocused();
  await expect(play).toBeEnabled();
  await shot(page, 'name-error');

  await tab(page, 'With friends').click();
  await page.getByRole('button', { name: 'Create a room' }).click();
  await expect(page.getByLabel('Your name')).toBeFocused();
  await expect(page.getByRole('button', { name: 'Create a room' })).toBeEnabled();
});

test('With friends offers a new room first and a code to join after it', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await menuReady(page);
  await page.getByLabel('Your name').fill('Ryan');
  await tab(page, 'With friends').click();
  await expect(page.getByRole('button', { name: 'Create a room' })).toHaveClass(/hud-primary/);
  await expect(page.getByRole('button', { name: 'Join', exact: true })).toHaveClass(/hud-button/);
  await page.getByLabel('Your name').focus();
  await shot(page, 'friends');

  await page.getByLabel('Room code').fill('abc');
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page.locator('.join-error')).toHaveText(/six letters and digits/);
  await expect(page.getByLabel('Room code')).toBeFocused();
  await shot(page, 'code-error');
});

test('a share link opens With friends with the code in, the invitation said, and Join as the gold button', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.addInitScript(() => window.localStorage.setItem('hookwars.menuTab', 'solo'));
  await menuReady(page, `?room=${INVITE}`);
  await expect(tab(page, 'With friends')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText(`You have been invited to room ${INVITE}.`)).toBeVisible();
  await expect(page.getByLabel('Room code')).toHaveValue(INVITE);
  await expect(page.getByRole('button', { name: 'Join', exact: true })).toHaveClass(/hud-primary/);
  await expect(page.getByRole('button', { name: 'Create a room' })).toHaveClass(/hud-button/);
  await page.getByLabel('Your name').fill('Ryan');
  await shot(page, 'share-link');
});

test('Settings opens over the menu, the lobby and the pause menu, and a change made in one shows in the others', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize(DESKTOP);
  await menuReady(page);
  let settings = await openSettings(page);
  await expect(settings.getByRole('radio', { name: 'Low' })).toBeChecked();
  await settings.getByRole('slider', { name: 'Music' }).fill('20');
  await shot(page, 'settings-menu');
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();
  await expect(page.getByRole('button', { name: 'Settings' })).toBeFocused();

  await page.getByLabel('Your name').fill('Ryan');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Lobby' })).toBeFocused();
  settings = await openSettings(page);
  await expect(settings.getByRole('slider', { name: 'Music' })).toHaveValue('20');
  await settings.getByRole('slider', { name: 'Effects' }).fill('30');
  await shot(page, 'settings-lobby');
  await settings.getByRole('button', { name: 'Done' }).click();
  await expect(settings).toBeHidden();

  await page.getByRole('button', { name: 'Add a bot to East Side' }).click();
  await page.getByRole('button', { name: 'Start match' }).click();
  await expect(page.locator('#stage')).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  await page.waitForFunction(() => window.__hookwars !== undefined);
  if (await page.evaluate(() => window.__hookwars!.introActive())) await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => window.__hookwars!.introActive())).toBe(false);
  await page.keyboard.press('Escape');
  const pause = page.getByRole('dialog', { name: 'Paused' });
  await expect(pause.getByRole('button', { name: 'Resume' })).toBeFocused();
  settings = await openSettings(page, pause);
  await expect(settings.getByRole('slider', { name: 'Music' })).toHaveValue('20');
  await expect(settings.getByRole('slider', { name: 'Effects' })).toHaveValue('30');
  await expect(settings.getByRole('radio', { name: 'Low' })).toBeChecked();
  await shot(page, 'settings-pause');
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();
  await expect(pause).toBeVisible();
  await expect(pause.getByRole('button', { name: 'Settings' })).toBeFocused();
  await pause.getByRole('button', { name: 'Resume' }).click();
  await expect(pause).toBeHidden();
});

test('the speaker beside Settings follows M, and pressing it mutes too', async ({ page }) => {
  await menuReady(page, '?audio=fake');
  const speaker = page.getByRole('button', { name: 'Mute' });
  await expect(speaker).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('heading', { name: 'Hook Wars' }).click();
  await page.keyboard.press('KeyM');
  await expect(speaker).toHaveAttribute('aria-pressed', 'true');
  const settings = await openSettings(page);
  await expect(settings.getByRole('checkbox', { name: /Mute/ })).toBeChecked();
  await page.keyboard.press('Escape');
  await speaker.click();
  await expect(speaker).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('KeyM');
  await expect(speaker).toHaveAttribute('aria-pressed', 'true');
});

for (const size of [DESKTOP, LAPTOP]) {
  test(`at ${size.width}x${size.height} Credits is in view on both tabs without scrolling`, async ({ page }) => {
    await page.setViewportSize(size);
    await menuReady(page, `?room=${INVITE}`);
    for (const name of ['With friends', 'Solo']) {
      await tab(page, name).click();
      await expect(page.getByRole('link', { name: 'Credits' })).toBeInViewport({ ratio: 1 });
      const scrolls = await page.locator('.menu').evaluate((el) => el.scrollHeight > el.clientHeight);
      expect(scrolls).toBe(false);
    }
  });
}

for (const width of NARROW_WIDTHS) {
  test(`at ${width}px wide nothing scrolls sideways`, async ({ page }) => {
    await page.setViewportSize({ width, height: PHONE.height });
    await menuReady(page, `?room=${INVITE}`);
    for (const name of ['With friends', 'Solo']) {
      await tab(page, name).click();
      const sideways = await page.locator('.menu').evaluate((el) => el.scrollWidth > el.clientWidth || document.documentElement.scrollWidth > window.innerWidth);
      expect(sideways).toBe(false);
    }
  });
}

test('on a phone the same menu stacks, the code field above Join', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await menuReady(page);
  await page.getByLabel('Your name').fill('Ryan');
  await shot(page, 'solo-390');
  await tab(page, 'With friends').click();
  const field = await page.getByLabel('Room code').boundingBox();
  const join = await page.getByRole('button', { name: 'Join', exact: true }).boundingBox();
  expect(join!.y).toBeGreaterThan(field!.y + field!.height - 1);
  await shot(page, 'friends-390');
});
