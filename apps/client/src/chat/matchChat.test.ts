import type { ChatChannel } from '@hookwars/protocol';
import { describe, expect, it } from 'vitest';
import type { ChatFeed } from './chatFeed';
import { EMPTY_CHAT } from './chatState';
import { bindChatKey, createMatchChat } from './matchChat';

function harness(remembered: ChatChannel = 'all') {
  const sent: string[] = [];
  const calls: string[] = [];
  let saved: ChatChannel = remembered;
  const feed: ChatFeed = { subscribe: () => () => {}, getSnapshot: () => EMPTY_CHAT, send: (channel, text) => sent.push(`${channel}:${text}`) };
  const chat = createMatchChat({
    feed,
    memory: { load: () => saved, save: (c) => void (saved = c) },
    release: () => calls.push('release'),
    focusGame: () => calls.push('focus'),
  });
  return { chat, sent, calls, saved: () => saved };
}

describe('the match chat input', () => {
  it('opens on the remembered channel, lets go of the fighter, and sends and closes on Enter', () => {
    const { chat, sent, calls } = harness('team');
    chat.open();
    expect(chat.ui.getSnapshot()).toEqual({ open: true, channel: 'team', draft: '' });
    expect(calls).toEqual(['release']);
    chat.setDraft('衝啊');
    chat.send();
    expect(sent).toEqual(['team:衝啊']);
    expect(chat.ui.getSnapshot()).toEqual({ open: false, channel: 'team', draft: '' });
    expect(calls).toEqual(['release', 'focus']);
  });

  it('switches channel while open and remembers the one last sent on', () => {
    const { chat, saved } = harness();
    chat.open();
    chat.switchChannel();
    expect(chat.ui.getSnapshot().channel).toBe('team');
    chat.setDraft('hi');
    chat.send();
    expect(saved()).toBe('team');
  });

  it('just closes on an empty Enter, without remembering the channel', () => {
    const { chat, saved } = harness();
    chat.open();
    chat.switchChannel();
    chat.send();
    expect(chat.isOpen()).toBe(false);
    expect(saved()).toBe('all');
  });

  it('throws the draft away on Escape, and keeps it when focus simply goes elsewhere', () => {
    const { chat, sent } = harness();
    chat.open();
    chat.setDraft('half a thought');
    chat.dismiss();
    expect(chat.ui.getSnapshot()).toMatchObject({ open: false, draft: 'half a thought' });
    chat.open();
    chat.cancel();
    expect(chat.ui.getSnapshot()).toMatchObject({ open: false, draft: '' });
    expect(sent).toEqual([]);
  });
});

describe('Enter in a match', () => {
  const key = (init: Partial<KeyboardEvent> & { target?: EventTarget | null }) =>
    Object.assign(new Event('keydown', { cancelable: true }), { key: 'Enter', repeat: false, isComposing: false, altKey: false, ctrlKey: false, metaKey: false, ...init });

  it('opens the chat when allowed, and not when a dialog has the keys or a composition is open', () => {
    const win = new EventTarget() as unknown as Window;
    let allowed = true;
    let opened = 0;
    const unbind = bindChatKey({ window: win, canOpen: () => allowed, open: () => (opened += 1) });
    const first = key({});
    win.dispatchEvent(first);
    expect([opened, first.defaultPrevented]).toEqual([1, true]);
    win.dispatchEvent(key({ isComposing: true }));
    win.dispatchEvent(key({ key: 'w' }));
    allowed = false;
    win.dispatchEvent(key({}));
    expect(opened).toBe(1);
    unbind();
    allowed = true;
    win.dispatchEvent(key({}));
    expect(opened).toBe(1);
  });
});
