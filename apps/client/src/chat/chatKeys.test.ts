import { describe, expect, it } from 'vitest';
import { chatKeyAction, COMPOSITION_ECHO_MS, NO_COMPOSITION, type ChatKeyPress, type Composition } from './chatKeys';

const press = (key: string, extra: Partial<ChatKeyPress> = {}): ChatKeyPress => ({
  key,
  keyCode: key === 'Enter' ? 13 : key === 'Escape' ? 27 : key === 'Tab' ? 9 : 65,
  isComposing: false,
  timeStamp: 1000,
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  ...extra,
});
const open: Composition = { active: true, endedAt: null };
const endedAt = (t: number): Composition => ({ active: false, endedAt: t });

describe('Enter, Escape and Tab with no input method', () => {
  it('sends on Enter, cancels on Escape and switches channel on Tab', () => {
    expect(chatKeyAction(press('Enter'), NO_COMPOSITION, true)).toBe('send');
    expect(chatKeyAction(press('Escape'), NO_COMPOSITION, true)).toBe('cancel');
    expect(chatKeyAction(press('Tab'), NO_COMPOSITION, true)).toBe('switch-channel');
  });

  it('leaves letters, Space and digits to the text', () => {
    ['w', 'a', ' ', '1', 'q', 'm', '`'].forEach((key) => expect(chatKeyAction(press(key), NO_COMPOSITION, true)).toBe('type'));
  });

  it('lets Tab move focus where there is one channel, and with Shift or a modifier', () => {
    expect(chatKeyAction(press('Tab'), NO_COMPOSITION, false)).toBe('type');
    expect(chatKeyAction(press('Tab', { shiftKey: true }), NO_COMPOSITION, true)).toBe('type');
    expect(chatKeyAction(press('Enter', { metaKey: true }), NO_COMPOSITION, true)).toBe('type');
  });
});

describe('a Zhuyin or Pinyin composition', () => {
  it('Chrome and Firefox: the confirming Enter comes while composing and is the input method\'s', () => {
    expect(chatKeyAction(press('Enter', { isComposing: true, keyCode: 229 }), open, true)).toBe('ime');
  });

  it('a keydown flagged only by keyCode 229 is the input method\'s', () => {
    expect(chatKeyAction(press('Enter', { keyCode: 229 }), NO_COMPOSITION, true)).toBe('ime');
  });

  it('Safari: compositionend arrives first and the Enter reports neither composing nor 229, yet does not send', () => {
    expect(chatKeyAction(press('Enter', { timeStamp: 1003 }), endedAt(1000), true)).toBe('ime');
  });

  it('Safari with the order inverted in time: the keydown stamped a little before compositionend', () => {
    expect(chatKeyAction(press('Enter', { timeStamp: 998 }), endedAt(1000), true)).toBe('ime');
  });

  it('a later, separate Enter after the candidate was confirmed sends', () => {
    expect(chatKeyAction(press('Enter', { timeStamp: 1000 + COMPOSITION_ECHO_MS + 200 }), endedAt(1000), true)).toBe('send');
  });

  it('only our own events say a composition is open: the Enter is still the input method\'s', () => {
    expect(chatKeyAction(press('Enter'), open, true)).toBe('ime');
  });

  it('Escape during a composition cancels the composition, not the chat', () => {
    expect(chatKeyAction(press('Escape', { isComposing: true, keyCode: 229 }), open, true)).toBe('ime');
    expect(chatKeyAction(press('Escape'), open, true)).toBe('ime');
  });

  it('Tab during a composition is left to the input method and does not switch channel', () => {
    expect(chatKeyAction(press('Tab', { isComposing: true }), open, true)).toBe('ime');
  });

  it('Escape after the composition closed cancels the chat', () => {
    expect(chatKeyAction(press('Escape', { timeStamp: 2000 }), endedAt(1000), true)).toBe('cancel');
  });
});
