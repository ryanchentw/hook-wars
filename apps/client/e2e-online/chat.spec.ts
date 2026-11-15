import { expect, test, type Page } from '@playwright/test';
import { close, createRoom, joinByLink, player, SHOT_DIR, startDuel } from './helpers';

/** Longer than the window in which an Enter right after a composition is taken as the composition's own. */
const AFTER_TYPING_MS = 120;
const SPAM_LINES = 12;
/** Lines the allowance passes at once before it starts to drop. */
const CHAT_BURST = 3;

async function say(page: Page, text: string, channel: 'all' | 'team' = 'all'): Promise<void> {
  await page.locator('#stage').focus();
  await page.keyboard.press('Enter');
  const label = page.locator('.chat-match .chat-channel');
  if (!(await label.innerText()).toLowerCase().startsWith(channel)) await page.keyboard.press('Tab');
  await expect(label).toHaveText(new RegExp(`^${channel}`, 'i'));
  await page.keyboard.insertText(text);
  await page.waitForTimeout(AFTER_TYPING_MS);
  await page.keyboard.press('Enter');
}

/** Every chat text this page's connection was sent, as the dev hook recorded it. */
const heard = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window.__hookwarsNet?.received() ?? []).flatMap((m) => (m.t === 'chat' ? [m.line.text] : [])));

const lines = (page: Page) => page.locator('.chat-match .chat-text');

test('an All line reaches both players, with a bubble over the speaker; a Team line never reaches the other side', async ({ browser }) => {
  const { host, guest } = await startDuel(browser);
  await say(host, '來抓我啊');
  await expect(lines(host)).toHaveText(['來抓我啊']);
  await expect(lines(guest)).toHaveText(['來抓我啊']);
  await expect(guest.locator('.unit-bubble:not([hidden])')).toHaveText('來抓我啊');
  await expect(guest.locator('.chat-match .chat-name')).toHaveClass(/hud-west/);

  await say(host, 'east is weak on the left', 'team');
  await expect(host.locator('.chat-match .chat-line').last()).toHaveText('[Team] Ada: east is weak on the left');
  await say(guest, '我聽不到你們');
  await expect(lines(host)).toHaveText(['來抓我啊', 'east is weak on the left', '我聽不到你們']);
  await expect(lines(guest)).toHaveText(['來抓我啊', '我聽不到你們']);
  expect(await heard(guest)).toEqual(['來抓我啊', '我聽不到你們']);
  expect(await heard(host)).toEqual(['來抓我啊', 'east is weak on the left', '我聽不到你們']);
  await close(host, guest);
});

test('markup sent online is shown as the characters typed on the other player\'s screen', async ({ browser }) => {
  const { host, guest } = await startDuel(browser);
  const markup = '<img src=x onerror=alert(1)><i>hi</i>';
  await say(guest, markup);
  await expect(lines(host)).toHaveText([markup]);
  await expect(host.locator('.unit-bubble:not([hidden])')).toHaveText(markup);
  expect(await host.locator('.chat-match img, .chat-match i, .unit-bubble img, .unit-bubble i').count()).toBe(0);
  await close(host, guest);
});

test('lines sent too fast are dropped by the server, and the sender is told once per run of dropped lines', async ({ browser }) => {
  const { host, guest } = await startDuel(browser);
  await guest.locator('#stage').focus();
  // As fast as keys can go: the allowance is three at once, then two every three seconds.
  for (let i = 1; i <= SPAM_LINES; i += 1) {
    await guest.keyboard.press('Enter');
    await guest.keyboard.insertText(`spam ${i}`);
    await guest.keyboard.press('Enter');
  }
  await expect(guest.locator('.chat-match .chat-notice')).toHaveText('Too fast: that line was not sent.');
  await expect.poll(() => heard(host)).toContain('spam 3');
  await host.waitForTimeout(500);
  const through = await heard(host);
  expect(through.slice(0, 3)).toEqual(['spam 1', 'spam 2', 'spam 3']);
  expect(through.length).toBeLessThan(SPAM_LINES);
  const limited = await guest.evaluate(() => (window.__hookwarsNet?.received() ?? []).filter((m) => m.t === 'chatLimited').length);
  // Told once per run of dropped lines: a run ends only when a line gets through again, as a refilled token lets one.
  const dropped = SPAM_LINES - through.length;
  expect(limited).toBeGreaterThanOrEqual(1);
  expect(limited).toBeLessThanOrEqual(through.length - CHAT_BURST + 1);
  expect(limited).toBeLessThan(dropped);
  await close(host, guest);
});

test('lobby chat between two browsers, newest line at the bottom', async ({ browser }) => {
  const [host, guest] = [await player(browser), await player(browser)];
  const code = await createRoom(host, 'Ada');
  await joinByLink(guest, code, 'Bo');
  await expect(host.locator('.team-east .slot-human')).toContainText('Bo');
  const hostInput = host.getByLabel('All chat');
  await host.getByRole('heading', { name: 'Lobby' }).focus();
  await host.keyboard.press('Enter');
  await expect(hostInput).toBeFocused();
  await host.keyboard.insertText('大家好，準備開打');
  await host.waitForTimeout(AFTER_TYPING_MS);
  await host.keyboard.press('Enter');
  const guestInput = guest.getByLabel('All chat');
  await guestInput.click();
  await guest.keyboard.insertText('<b>ready</b> 👍🏽');
  await guest.waitForTimeout(AFTER_TYPING_MS);
  await guest.keyboard.press('Enter');
  for (const page of [host, guest]) {
    await expect(page.locator('.chat-lobby .chat-line')).toHaveText(['Ada: 大家好，準備開打', 'Bo: <b>ready</b> 👍🏽']);
  }
  await expect(hostInput).toHaveValue('');
  await host.keyboard.press('Escape');
  await expect(hostInput).not.toBeFocused();
  await host.screenshot({ path: `${SHOT_DIR}/chat-lobby.png`, fullPage: true });
  await close(host, guest);
});
