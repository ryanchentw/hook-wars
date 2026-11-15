import { expect, test, type Page } from '@playwright/test';

const SHOT_DIR = 'test-results';
const DESKTOP = { width: 1280, height: 720 };
const PHONE = { width: 390, height: 844 };
const LOCAL = 'west-0';
/** Longer than the window in which an Enter right after a composition is taken as the composition's own. */
const AFTER_COMPOSITION_MS = 120;

async function matchUp(page: Page, query = 'roster=1v1&intro=off&seed=3&opponent=idle'): Promise<void> {
  await page.setViewportSize(DESKTOP);
  await page.goto(`/?${query}`);
  await page.waitForFunction(() => window.__hookwars !== undefined, null, { timeout: 30_000 });
  await expect(page.locator('#stage')).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  await page.waitForFunction(() => window.__hookwars!.getView().tick > 0);
  await page.locator('#stage').focus();
}

const input = (page: Page) => page.locator('.chat-match .chat-input');
const log = (page: Page) => page.locator('.chat-match .chat-log');
const posOf = (page: Page) => page.evaluate((id) => window.__hookwars!.getState().players.find((p) => p.id === id)!.pos, LOCAL);
const hooks = (page: Page) => page.evaluate(() => window.__hookwars!.getState().hooks.length);

test('Enter opens the chat; typing moves nothing and throws nothing; Enter sends the line and a bubble; Esc cancels', async ({ page }) => {
  await matchUp(page);
  await page.keyboard.press('Enter');
  await expect(input(page)).toBeFocused();
  await expect(page.locator('.chat-match .chat-channel')).toHaveText(/^All/);
  const before = await posOf(page);
  await page.keyboard.type('wasd  wasd');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(600);
  await page.keyboard.up('KeyW');
  await page.keyboard.press('Space');
  await page.keyboard.press('Digit1');
  expect(await posOf(page)).toEqual(before);
  expect(await hooks(page)).toBe(0);
  await expect(input(page)).toHaveValue('wasd  wasdw 1');

  await page.keyboard.press('Enter');
  await expect(input(page)).toHaveCount(0);
  await expect(page.locator('#stage')).toBeFocused();
  await expect(log(page).locator('.chat-line')).toHaveText([/^.+: wasd wasdw 1$/]);
  await expect(page.locator('.unit-bubble:not([hidden])')).toHaveText('wasd wasdw 1');

  await page.keyboard.press('Enter');
  await page.keyboard.type('never mind');
  await page.keyboard.press('Escape');
  await expect(input(page)).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Paused' })).toHaveCount(0);
  await expect(log(page).locator('.chat-line')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(input(page)).toHaveValue('');
  await page.keyboard.press('Enter');
  await expect(log(page).locator('.chat-line')).toHaveCount(1);

  await page.keyboard.down('KeyD');
  await expect.poll(async () => (await posOf(page)).x, { timeout: 5000 }).toBeGreaterThan(before.x + 1);
  await page.keyboard.up('KeyD');
});

test('held keys are let go the moment the chat opens', async ({ page }) => {
  await matchUp(page);
  await page.keyboard.down('KeyD');
  await expect.poll(async () => (await posOf(page)).x).toBeGreaterThan((await posOf(page)).x);
  await page.keyboard.press('Enter');
  const stopped = await posOf(page);
  await page.waitForTimeout(500);
  const later = await posOf(page);
  await page.keyboard.up('KeyD');
  expect(Math.abs(later.x - stopped.x)).toBeLessThan(1);
});

test('an Enter that confirms a Zhuyin composition never sends, in the event orders Chrome and Safari produce', async ({ page }) => {
  await matchUp(page);
  await page.keyboard.press('Enter');
  const field = input(page);
  await expect(field).toBeFocused();
  const outcome = await field.evaluate(async (el: HTMLInputElement) => {
    const setValue = (value: string): void => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
      el.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true, data: value }));
    };
    const enter = (init: { isComposing: boolean; keyCode: number }): boolean => {
      const event = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true, isComposing: init.isComposing });
      Object.defineProperty(event, 'keyCode', { value: init.keyCode });
      el.dispatchEvent(event);
      return document.activeElement === el;
    };
    const steps: string[] = [];
    // Chrome and Firefox: the confirming Enter arrives while still composing, flagged and as keyCode 229.
    el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
    setValue('ㄋㄧˇ');
    steps.push(`chrome-open:${enter({ isComposing: true, keyCode: 229 })}`);
    setValue('你');
    el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '你' }));
    // Safari: compositionend first, then an Enter that says it is not composing, with keyCode 229.
    el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
    setValue('你ㄏㄠˇ');
    setValue('你好');
    el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '好' }));
    steps.push(`safari-229:${enter({ isComposing: false, keyCode: 229 })}`);
    // Safari at its worst: compositionend, then an Enter with keyCode 13, moments later.
    el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
    setValue('你好ㄇㄚ˙');
    setValue('你好嗎');
    el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '嗎' }));
    steps.push(`safari-13:${enter({ isComposing: false, keyCode: 13 })}`);
    return { steps, value: el.value };
  });
  expect(outcome).toEqual({ steps: ['chrome-open:true', 'safari-229:true', 'safari-13:true'], value: '你好嗎' });
  await expect(log(page).locator('.chat-line')).toHaveCount(0);

  await page.waitForTimeout(AFTER_COMPOSITION_MS);
  await page.keyboard.press('Enter');
  await expect(log(page).locator('.chat-text')).toHaveText(['你好嗎']);
});

test('Chromium\'s own input method: a composition in progress is not sent by Enter, and Escape cancels it, not the chat', async ({ page }) => {
  await matchUp(page);
  await page.keyboard.press('Enter');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.imeSetComposition', { text: 'ㄏㄠˇ', selectionStart: 3, selectionEnd: 3 });
  await expect(input(page)).toHaveValue('ㄏㄠˇ');
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 229 });
  await expect(input(page)).toBeFocused();
  await cdp.send('Input.imeSetComposition', { text: 'ㄏㄠˇ', selectionStart: 3, selectionEnd: 3 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 229 });
  await expect(input(page)).toBeFocused();
  await expect(log(page).locator('.chat-line')).toHaveCount(0);
  await cdp.send('Input.insertText', { text: '好' });
  await expect(input(page)).toHaveValue('好');
  await page.waitForTimeout(AFTER_COMPOSITION_MS);
  await page.keyboard.press('Enter');
  await expect(log(page).locator('.chat-text')).toHaveText(['好']);
});

test('Tab switches channel while the chat is open, and shows the scoreboard while it is closed', async ({ page }) => {
  await matchUp(page);
  await page.keyboard.press('Enter');
  const channel = page.locator('.chat-match .chat-channel');
  await expect(channel).toHaveText(/^All/);
  await page.keyboard.press('Tab');
  await expect(channel).toHaveText(/^Team/);
  await expect(input(page)).toBeFocused();
  await expect(page.getByRole('region', { name: 'Scoreboard' })).toHaveCount(0);
  await expect(page.locator('.chat-match .hud-sr[aria-live]')).toHaveText('Chat to Team');
  await page.keyboard.type('沒人看到我');
  await page.keyboard.press('Enter');
  await expect(log(page).locator('.chat-line')).toHaveText([/^\[Team\] .+: 沒人看到我$/]);

  await page.keyboard.down('Tab');
  await expect(page.getByRole('region', { name: 'Scoreboard' })).toBeVisible();
  await page.keyboard.up('Tab');
  await expect(page.getByRole('region', { name: 'Scoreboard' })).toHaveCount(0);

  await page.keyboard.press('Enter');
  await expect(channel).toHaveText(/^Team/);
  await page.keyboard.press('Escape');
});

test('markup in a message is shown as the characters typed, in the log and in the bubble', async ({ page }) => {
  await matchUp(page);
  const markup = '<img src=x onerror=alert(1)><b>bold</b>';
  await page.keyboard.press('Enter');
  await page.keyboard.type(markup);
  await page.keyboard.press('Enter');
  await expect(log(page).locator('.chat-text')).toHaveText([markup]);
  await expect(page.locator('.unit-bubble:not([hidden])')).toHaveText(markup);
  expect(await page.locator('.chat-match img, .unit-bubble img, .chat-match b, .unit-bubble b').count()).toBe(0);
});

test('the counter shows near sixty characters and the input takes no more', async ({ page }) => {
  await matchUp(page);
  await page.keyboard.press('Enter');
  await page.keyboard.insertText('好'.repeat(55));
  await expect(page.locator('.chat-match .chat-counter')).toHaveText('55/60');
  await page.keyboard.insertText('👍🏽'.repeat(10));
  await expect(page.locator('.chat-match .chat-counter')).toHaveText('60/60');
  expect(await input(page).inputValue()).toBe(`${'好'.repeat(55)}${'👍🏽'.repeat(5)}`);
  await page.keyboard.press('Escape');
});

test('screenshots: the input on All and on Team, a bubble in Chinese, the log, and a phone', async ({ page }) => {
  await matchUp(page, 'roster=3v3&intro=off&seed=3&opponent=idle');
  const say = async (text: string, team = false): Promise<void> => {
    await page.keyboard.press('Enter');
    if (team) await page.keyboard.press('Tab');
    await page.keyboard.insertText(text);
    await page.waitForTimeout(AFTER_COMPOSITION_MS);
    await page.keyboard.press('Enter');
    if (team) {
      await page.keyboard.press('Enter');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Escape');
    }
  };
  await say('準備好了嗎？');
  await say('先守中路', true);
  await say('gg ez 👍🏽');
  await say('你的鉤子歪了啦，再練十年吧 🤣🤣');
  await page.evaluate(() => window.__hookwars!.setPaused(true));
  await expect(page.locator('.unit-bubble:not([hidden])')).toHaveText('你的鉤子歪了啦，再練十年吧 🤣🤣');
  await page.screenshot({ path: `${SHOT_DIR}/chat-bubble.png` });
  await page.screenshot({ path: `${SHOT_DIR}/chat-log.png` });

  await page.keyboard.press('Enter');
  await page.keyboard.insertText('來啊');
  await page.screenshot({ path: `${SHOT_DIR}/chat-input-all.png` });
  await page.keyboard.press('Tab');
  await page.screenshot({ path: `${SHOT_DIR}/chat-input-team.png` });
  await page.keyboard.press('Escape');

  await page.setViewportSize(PHONE);
  await page.keyboard.press('Enter');
  await page.keyboard.insertText('手機也能聊');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(PHONE.width);
  await page.screenshot({ path: `${SHOT_DIR}/chat-phone.png` });
});

test('the chat sits above the player panel and clear of the shop strip at 1280x720 and at 390 wide', async ({ page }) => {
  await matchUp(page);
  await page.keyboard.press('Enter');
  await page.keyboard.insertText('一二三四五六七八九十'.repeat(5));
  for (const size of [DESKTOP, PHONE]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(200);
    const chat = (await page.locator('.chat-match').boundingBox())!;
    for (const covered of ['.hud-panel', '.hud-shop']) {
      const box = (await page.locator(covered).boundingBox())!;
      const overlaps = chat.x < box.x + box.width && box.x < chat.x + chat.width && chat.y < box.y + box.height && box.y < chat.y + chat.height;
      expect(overlaps, `${covered} at ${size.width}`).toBe(false);
    }
    expect(chat.x).toBeGreaterThanOrEqual(0);
    expect(chat.x + chat.width).toBeLessThanOrEqual(size.width);
  }
});
