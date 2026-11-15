import { expect, test, type Page } from '@playwright/test';

const SHOT_DIR = 'test-results';
const DESKTOP = { width: 1280, height: 720 };
const PHONE = { width: 390, height: 844 };
const MAX_TABS = 40;
const LONG_MATCH = 3_000;

type Memory = { readonly geometries: number; readonly textures: number };

async function tick(page: Page): Promise<number> {
  return page.evaluate(() => window.__hookwars!.getState().tick);
}

async function matchUp(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__hookwars !== undefined, null, { timeout: 30_000 });
  await expect(page.locator('#stage')).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
}

/** A different match from `previous` is up: a rematch replaces the hook along with the match. */
async function nextMatchUp(page: Page, previousTick: number): Promise<void> {
  await matchUp(page);
  await expect.poll(() => tick(page)).toBeLessThan(previousTick);
}

/** Presses Tab until the focused element has this accessible name, as a keyboard player would. */
async function tabTo(page: Page, name: string): Promise<void> {
  for (let i = 0; i < MAX_TABS; i += 1) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return el?.getAttribute('aria-label') ?? el?.textContent?.trim() ?? '';
    });
    if (focused === name) return;
  }
  throw new Error(`Tab never reached "${name}"`);
}

async function skipIntro(page: Page): Promise<void> {
  if (await page.evaluate(() => window.__hookwars!.introActive())) await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => window.__hookwars!.introActive())).toBe(false);
}

async function finishMatch(page: Page): Promise<void> {
  await page.evaluate((s) => window.__hookwars!.fastForward(s), LONG_MATCH);
  await expect(page.getByRole('dialog', { name: 'match over' })).toBeVisible();
}

async function enterLobby(page: Page, name = 'Ryan'): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Play' }).click();
  await expect(page.getByRole('heading', { name: 'Lobby' })).toBeFocused();
}

test('menu to lobby to a 3v3, to the end, a rematch and back to the lobby, with the keyboard alone', async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  const name = page.getByLabel('Your name');
  await expect(name).toBeFocused();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOT_DIR}/m3-menu.png` });
  await page.keyboard.type('Ryan');
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/#\/lobby$/);
  await expect(page.getByRole('heading', { name: 'Lobby' })).toBeFocused();
  await page.screenshot({ path: `${SHOT_DIR}/m3-lobby-empty.png` });
  await tabTo(page, 'Fill with bots');
  await page.keyboard.press('Enter');
  await expect(page.locator('.slot-bot')).toHaveCount(5);
  await page.screenshot({ path: `${SHOT_DIR}/m3-lobby-full.png` });
  await tabTo(page, 'Start match');
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/#\/match$/);
  await matchUp(page);
  expect(await page.evaluate(() => window.__hookwars!.getState().players.length)).toBe(6);
  await skipIntro(page);
  await finishMatch(page);
  const table = page.getByRole('table', { name: 'Final scores' });
  await expect(table.getByRole('row')).toHaveCount(1 + 2 + 6);
  await page.screenshot({ path: `${SHOT_DIR}/m3-end.png` });
  await expect(page.getByRole('button', { name: 'Rematch' })).toBeFocused();
  const endedAt = await tick(page);
  await page.keyboard.press('Enter');

  await nextMatchUp(page, endedAt);
  await expect(page).toHaveURL(/#\/match$/);
  await skipIntro(page);
  await page.keyboard.press('Escape');
  const pause = page.getByRole('dialog', { name: 'Paused' });
  await expect(pause).toBeVisible();
  await tabTo(page, 'Back to lobby');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/lobby$/);
  await expect(page.getByRole('heading', { name: 'Lobby' })).toBeFocused();
  expect(await page.evaluate(() => window.__hookwars === undefined)).toBe(true);
  await expect(page.locator('.slot-bot')).toHaveCount(5);
});

test('the name is trimmed, checked when Play is pressed, and remembered', async ({ page }) => {
  await page.goto('/');
  const name = page.getByLabel('Your name');
  const play = page.getByRole('button', { name: 'Play' });
  const error = page.locator('.field-error');

  await play.click();
  await expect(error).toHaveText(/Enter a name\./);
  await expect(name).toHaveAttribute('aria-invalid', 'true');
  await expect(name).toBeFocused();
  await expect(page).not.toHaveURL(/lobby/);

  await name.fill('x'.repeat(17));
  await play.click();
  await expect(error).toHaveText(/at most 16 characters/);
  await name.fill('a\u0007b');
  await play.click();
  await expect(error).toHaveText(/letters, numbers and punctuation/);
  await name.fill('   ');
  await name.blur();
  await expect(error).toHaveText(/Enter a name\./);

  await name.fill('  Ada Lovelace  ');
  await expect(error).toBeHidden();
  await play.click();
  await expect(page).toHaveURL(/#\/lobby$/);
  await expect(page.locator('.slot-human')).toContainText('Ada Lovelace');

  await page.goto('/');
  await expect(page.getByLabel('Your name')).toHaveValue('Ada Lovelace');
  await expect(page.getByLabel('Your name')).toBeFocused();
});

test('Start stays off until each side has a fighter, whichever side the player sits on', async ({ page }) => {
  await enterLobby(page);
  const start = page.getByRole('button', { name: 'Start match' });
  await expect(start).toBeDisabled();
  await expect(page.getByText('Each side needs at least one fighter.')).toBeVisible();

  await page.getByRole('button', { name: 'Add a bot to East Side' }).click();
  await expect(start).toBeEnabled();
  await page.getByRole('button', { name: 'Sit here in East Side seat 2' }).click();
  await expect(start).toBeDisabled();
  await page.getByRole('button', { name: 'Add a bot to West Side' }).click();
  await expect(page.locator('.team-west .slot').nth(0)).toHaveClass(/slot-bot/);
  await expect(start).toBeEnabled();
  await page.getByRole('button', { name: /^Remove .+ from West Side$/ }).click();
  await expect(start).toBeDisabled();
  await expect(page.locator('.slot').nth(0)).toBeFocused();
});

test('+ Bot fills the team in order and keeps the keyboard when the team is full', async ({ page }) => {
  await enterLobby(page);
  const addEast = page.getByRole('button', { name: 'Add a bot to East Side' });
  await addEast.focus();
  for (let seat = 1; seat <= 3; seat += 1) {
    await page.keyboard.press('Enter');
    await expect(page.locator('.team-east .slot-bot')).toHaveCount(seat);
  }
  await expect(addEast).toHaveAttribute('aria-disabled', 'true');
  await expect(addEast).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.team-east .slot-bot')).toHaveCount(3);
});

test('holding Tab shows every fighter by side without moving focus out of the game', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto('/?roster=3v3&intro=off&seed=3');
  await matchUp(page);
  await page.screenshot({ path: `${SHOT_DIR}/m3-3v3-start.png` });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${SHOT_DIR}/m3-3v3-fight.png` });

  const focusedBefore = await page.evaluate(() => document.activeElement?.id ?? document.activeElement?.tagName);
  const board = page.getByRole('region', { name: 'Scoreboard' });
  await expect(board).toBeHidden();
  await page.keyboard.down('Tab');
  await expect(board).toBeVisible();
  await expect(board.getByRole('row')).toHaveCount(1 + 2 + 6);
  for (const label of ['West Side', 'East Side']) await expect(board.getByText(label, { exact: true })).toBeVisible();
  await expect(board.locator('tr.is-local')).toContainText('You');
  await page.screenshot({ path: `${SHOT_DIR}/m3-scoreboard.png` });
  expect(await page.evaluate(() => document.activeElement?.id ?? document.activeElement?.tagName)).toBe(focusedBefore);
  await page.keyboard.up('Tab');
  await expect(board).toBeHidden();

  const toggle = page.getByRole('button', { name: 'Scores' });
  await toggle.click();
  await expect(board).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
});

test('Escape pauses the match behind a menu, and Escape or Resume carries on', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto('/?roster=3v3&intro=off&seed=5');
  await matchUp(page);
  await expect.poll(() => tick(page)).toBeGreaterThan(10);

  await page.keyboard.press('Escape');
  const pause = page.getByRole('dialog', { name: 'Paused' });
  await expect(pause).toBeVisible();
  await expect(pause.getByRole('button', { name: 'Resume' })).toBeFocused();
  const heldAt = await tick(page);
  await page.waitForTimeout(500);
  expect(await tick(page)).toBe(heldAt);
  await page.screenshot({ path: `${SHOT_DIR}/m3-pause.png` });

  await page.keyboard.press('Escape');
  await expect(pause).toBeHidden();
  await expect.poll(() => tick(page)).toBeGreaterThan(heldAt + 5);

  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(pause).toBeVisible();
  await pause.getByRole('button', { name: 'Resume' }).click();
  await expect(pause).toBeHidden();
  const resumedAt = await tick(page);
  await expect.poll(() => tick(page)).toBeGreaterThan(resumedAt + 5);
});

test('Back and Forward move between menu, lobby and match, and never into a match nobody started', async ({ page }) => {
  await enterLobby(page);
  await page.goBack();
  await expect(page.getByLabel('Your name')).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'Lobby' })).toBeVisible();

  await page.getByRole('button', { name: 'Add a bot to East Side' }).click();
  await page.getByRole('button', { name: 'Start match' }).click();
  await matchUp(page);
  await page.goBack();
  await expect(page).toHaveURL(/#\/lobby$/);
  await expect(page.getByRole('heading', { name: 'Lobby' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__hookwars === undefined)).toBe(true);

  await page.goForward();
  await expect(page).toHaveURL(/#\/lobby$/);
  await expect(page.getByRole('heading', { name: 'Lobby' })).toBeVisible();

  await page.getByRole('link', { name: 'Credits' }).click();
  await expect(page.getByRole('dialog', { name: '致敬' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog', { name: '致敬' })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Lobby' })).toBeVisible();

  await page.getByRole('button', { name: '‹ Menu' }).click();
  await expect(page.getByLabel('Your name')).toBeVisible();
});

test('three matches in a row, through the lobby each time, leave the GPU holding what the first one did', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/?roster=3v3&intro=off&opponent=idle&scene=harbour');
  const rounds: Memory[] = [];
  for (let round = 0; round < 3; round += 1) {
    await matchUp(page);
    // Fighters pick up what they carry over their first drawn frames, and under software WebGL on a busy
    // machine those frames can be far apart, so read the counts once they have stopped changing.
    const read = (): Promise<Memory> => page.evaluate(() => {
      const { geometries, textures } = window.__hookwars!.renderStats();
      return { geometries, textures };
    });
    let settled = await read();
    await expect.poll(async () => {
      await page.waitForTimeout(400);
      const next = await read();
      const same = next.geometries === settled.geometries && next.textures === settled.textures;
      settled = next;
      return same;
    }, { timeout: 20_000 }).toBe(true);
    rounds.push(settled);
    expect(await page.locator('#stage canvas').count()).toBe(1);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Back to lobby' }).click();
    await expect(page.getByRole('heading', { name: 'Lobby' })).toBeVisible();
    await page.getByRole('button', { name: 'Start match' }).click();
  }
  test.info().annotations.push({ type: 'gpu memory by match', description: JSON.stringify(rounds) });
  expect(rounds[1]).toEqual(rounds[0]);
  expect(rounds[2]).toEqual(rounds[0]);
});

test('menu and lobby fit a phone', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await expect(page.getByLabel('Your name')).toBeVisible();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOT_DIR}/m3-menu-390.png` });
  await page.getByLabel('Your name').fill('Ryan');
  await page.getByRole('button', { name: 'Play' }).click();
  await page.getByRole('button', { name: 'Fill with bots' }).click();
  await page.screenshot({ path: `${SHOT_DIR}/m3-lobby-390.png`, fullPage: true });
  const overflow = await page.evaluate(() => document.querySelector('.lobby')!.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});
