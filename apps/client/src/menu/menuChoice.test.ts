import { describe, expect, it } from 'vitest';
import type { Invite } from '../app/onlineMode';
import { openingTab, parseMenuTab, primaryAction, tabAfterKey } from './menuChoice';
import { createTabMemory } from './tabMemory';

const link: Invite = { code: 'ABC234', why: 'link' };
const back: Invite = { code: 'ABC234', why: 'return' };

describe('openingTab', () => {
  it('opens With friends for a share link or a lost seat, whatever was used last', () => {
    expect(openingTab(link, 'solo')).toBe('friends');
    expect(openingTab(back, null)).toBe('friends');
  });

  it('otherwise opens the tab used last, and Solo the first time', () => {
    expect(openingTab(null, 'friends')).toBe('friends');
    expect(openingTab(null, 'solo')).toBe('solo');
    expect(openingTab(null, null)).toBe('solo');
  });
});

describe('primaryAction', () => {
  it('is Play on Solo, even with a room on offer', () => {
    expect(primaryAction('solo', null)).toBe('play');
    expect(primaryAction('solo', link)).toBe('play');
  });

  it('is Create on With friends, and Join once a room is on offer', () => {
    expect(primaryAction('friends', null)).toBe('create');
    expect(primaryAction('friends', link)).toBe('join');
    expect(primaryAction('friends', back)).toBe('join');
  });
});

describe('tabAfterKey', () => {
  it('moves with the arrow keys and wraps at both ends', () => {
    expect(tabAfterKey('solo', 'ArrowRight')).toBe('friends');
    expect(tabAfterKey('friends', 'ArrowRight')).toBe('solo');
    expect(tabAfterKey('solo', 'ArrowLeft')).toBe('friends');
    expect(tabAfterKey('friends', 'ArrowUp')).toBe('solo');
  });

  it('jumps to the ends with Home and End, and leaves every other key alone', () => {
    expect(tabAfterKey('friends', 'Home')).toBe('solo');
    expect(tabAfterKey('solo', 'End')).toBe('friends');
    expect(tabAfterKey('solo', 'Enter')).toBeNull();
    expect(tabAfterKey('solo', 'a')).toBeNull();
  });
});

describe('tab memory', () => {
  const fakeStorage = (initial: Record<string, string> = {}): Storage => {
    const items = new Map(Object.entries(initial));
    return {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
    } as Storage;
  };

  it('remembers the tab and ignores anything stored that is not a tab', () => {
    const storage = fakeStorage({ 'hookwars.menuTab': 'online' });
    const memory = createTabMemory(() => storage);
    expect(memory.load()).toBeNull();
    memory.save('friends');
    expect(memory.load()).toBe('friends');
    expect(parseMenuTab('solo')).toBe('solo');
  });

  it('forgets quietly when storage is blocked', () => {
    const memory = createTabMemory(() => {
      throw new Error('blocked');
    });
    expect(memory.load()).toBeNull();
    expect(() => memory.save('solo')).not.toThrow();
  });
});
