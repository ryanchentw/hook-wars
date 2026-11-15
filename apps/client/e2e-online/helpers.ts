import { expect, type Browser, type Page } from '@playwright/test';

export const SHOT_DIR = 'test-results';
export const DESKTOP = { width: 1280, height: 720 };
/** The menu appears once the models have loaded, which software WebGL on a busy machine takes its time over. */
const PAGE_LOAD_MS = 30_000;
const WEST = 'west-0';
const EAST = 'east-0';

export type Vec = { readonly x: number; readonly y: number };

/** A player with a browser of their own: separate storage, so a separate seat. */
export async function player(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ viewport: DESKTOP });
  return context.newPage();
}

export async function createRoom(page: Page, name: string, query = ''): Promise<string> {
  await page.goto(`/${query}`);
  await page.getByLabel('Your name').fill(name, { timeout: PAGE_LOAD_MS });
  await page.getByRole('button', { name: 'Create a room' }).click();
  await expect(page.getByRole('heading', { name: 'Lobby' })).toBeVisible();
  const code = await page.locator('.room-code strong').innerText();
  expect(code).toMatch(/^[A-Z2-9]{6}$/);
  return code;
}

/** Opens the link a friend was sent, and goes in from the name step. */
export async function joinByLink(page: Page, code: string, name: string, extraQuery = ''): Promise<void> {
  await page.goto(`/?room=${code}${extraQuery}`);
  await expect(page.getByText(`You have been invited to room ${code}.`)).toBeVisible({ timeout: PAGE_LOAD_MS });
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Join room' }).click();
}

export async function matchUp(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__hookbrawl !== undefined, null, { timeout: 45_000 });
  await expect(page.locator('#stage')).toHaveAttribute('data-state', 'ready', { timeout: 45_000 });
  if (await page.evaluate(() => window.__hookbrawl!.introActive())) await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__hookbrawl!.getView().tick > 0, null, { timeout: 30_000 });
}

/** The host sets fog of war and waits for the server to agree. */
export async function setFog(host: Page, on: boolean): Promise<void> {
  const fog = host.getByLabel('Fog of war');
  if ((await fog.isChecked()) !== on) await fog.click();
  await expect(fog).toBeChecked({ checked: on });
}

/** Two players in one room, a side each, in a match the first of them started. Fog is off unless asked for, since most specs follow the enemy. */
export async function startDuel(browser: Browser, options: { query?: string; fog?: boolean; guestName?: string; beforeStart?: (host: Page) => Promise<void> } = {}) {
  const [host, guest] = [await player(browser), await player(browser)];
  const query = options.query ?? '';
  const guestName = options.guestName ?? 'Bo';
  const code = await createRoom(host, 'Ada', query === '' ? '' : `?${query}`);
  await joinByLink(guest, code, guestName, query === '' ? '' : `&${query}`);
  await expect(host.locator('.team-east .slot-human')).toContainText(guestName);
  await setFog(host, options.fog ?? false);
  await options.beforeStart?.(host);
  await host.getByRole('button', { name: 'Start match' }).click();
  await Promise.all([matchUp(host), matchUp(guest)]);
  return { host, guest, code };
}

/** Where this page draws a fighter, or null when it has not been told of them. */
export function posOf(page: Page, id: string): Promise<Vec | null> {
  return page.evaluate((playerId) => window.__hookbrawl!.getView().players.find((p) => p.id === playerId)?.pos ?? null, id);
}

/** Holds movement keys until this page's own fighter satisfies `arrived`, then lets go. */
export async function walkUntil(page: Page, keys: readonly string[], id: string, arrived: (pos: Vec) => boolean): Promise<void> {
  await page.locator('#stage').focus();
  for (const key of keys) await page.keyboard.down(key);
  try {
    await expect.poll(async () => arrived((await posOf(page, id))!), { timeout: 20_000, intervals: [50] }).toBe(true);
  } finally {
    for (const key of keys) await page.keyboard.up(key);
  }
}

export async function close(...pages: readonly Page[]): Promise<void> {
  await Promise.all(pages.map((page) => page.context().close()));
}

export const score = (page: Page): Promise<string> => page.locator('.hud-score').innerText();

export { EAST, WEST };
