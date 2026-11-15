import type { ChatLine } from '@hookwars/protocol';
import type { MemberId } from '@hookwars/room';
import type { PlayerId } from '@hookwars/sim';
import { describe, expect, it } from 'vitest';
import { bubbleMs, bubblesAt, BUBBLE_MS } from './bubbles';
import { createChannelMemory } from './channelMemory';
import { createChatInbox, createLocalChat } from './chatFeed';
import { addLines, clampDraft, EMPTY_CHAT, otherChannel, type ChatEntry } from './chatState';

const ADA = 'm1' as MemberId;
const BO = 'm2' as MemberId;
const WEST = 'west-0' as PlayerId;
const EAST = 'east-0' as PlayerId;
const line = (seq: number, extra: Partial<ChatLine> = {}): ChatLine => ({ seq, from: BO, name: 'Bo' as never, team: 'east', fighter: EAST, channel: 'all', text: `line ${seq}`, ...extra });
const entry = (seq: number, at: number, extra: Partial<ChatLine> = {}, live = true): ChatEntry => ({ line: line(seq, extra), at, own: false, live });

describe('the client log', () => {
  it('holds each line once, in the room\'s order, however it arrives', () => {
    const once = addLines(EMPTY_CHAT, [entry(2, 0), entry(1, 0)]);
    const twice = addLines(once, [entry(2, 5), entry(3, 5)]);
    expect(twice.entries.map((e) => e.line.seq)).toEqual([1, 2, 3]);
    expect(addLines(twice, [entry(3, 9)])).toBe(twice);
  });

  it('keeps the last hundred lines', () => {
    const many = addLines(EMPTY_CHAT, Array.from({ length: 130 }, (_, i) => entry(i + 1, 0)));
    expect(many.entries).toHaveLength(100);
    expect(many.entries[0]?.line.seq).toBe(31);
  });
});

describe('the draft', () => {
  it('is cut to sixty characters without splitting an emoji or a Chinese character', () => {
    expect(clampDraft('好'.repeat(70))).toBe('好'.repeat(60));
    const thumbs = '👍🏽'.repeat(61);
    expect(clampDraft(thumbs)).toBe('👍🏽'.repeat(60));
  });

  it('is cut to the code unit bound when long emoji sequences reach it first', () => {
    const family = '👨‍👩‍👧‍👦';
    const clamped = clampDraft(family.repeat(60));
    expect(clamped.length).toBeLessThanOrEqual(400);
    expect(clamped).toBe(family.repeat(Math.floor(400 / family.length)));
  });

  it('switches channel back and forth', () => {
    expect(otherChannel('all')).toBe('team');
    expect(otherChannel(otherChannel('all'))).toBe('all');
  });
});

describe('the inbox', () => {
  it('sends the cleaned text and nothing when nothing is left of it', () => {
    const sent: string[] = [];
    const inbox = createChatInbox({ deliver: (channel, text) => sent.push(`${channel}:${text}`), now: () => 0 });
    inbox.send('team', '  hi‮  there ');
    inbox.send('all', ' ​ ');
    inbox.send('all', 'x'.repeat(61));
    expect(sent).toEqual(['team:hi there']);
  });

  it('marks the lines this member said, and the history a rejoin brings as not live', () => {
    const inbox = createChatInbox({ deliver: () => {}, now: () => 7 });
    inbox.setSelf(ADA);
    inbox.receive([line(1, { from: ADA })], false);
    inbox.receive([line(2)], true);
    expect(inbox.getSnapshot().entries.map((e) => [e.own, e.live, e.at])).toEqual([
      [true, false, 7],
      [false, true, 7],
    ]);
  });

  it('notes when the server dropped a line for coming too fast', () => {
    const inbox = createChatInbox({ deliver: () => {}, now: () => 42 });
    inbox.limited();
    expect(inbox.getSnapshot().limitedAt).toBe(42);
  });
});

describe('local chat', () => {
  it('brings a line straight back as the local fighter\'s own, on the channel chosen', () => {
    const chat = createLocalChat(() => ({ from: 'local' as MemberId, name: 'Ryan' as never, team: 'west', fighter: WEST }), () => 3);
    chat.send('team', '  衝  ');
    chat.send('all', 'gg');
    expect(chat.getSnapshot().entries.map((e) => [e.line.seq, e.line.channel, e.line.text, e.line.fighter, e.own])).toEqual([
      [1, 'team', '衝', WEST, true],
      [2, 'all', 'gg', WEST, true],
    ]);
  });
});

describe('bubbles', () => {
  it('lasts longer for a longer line, within bounds', () => {
    expect(bubbleMs('gg')).toBe(BUBBLE_MS.min);
    expect(bubbleMs('你'.repeat(30))).toBe(BUBBLE_MS.base + 30 * BUBBLE_MS.perCharacter);
    expect(bubbleMs('你'.repeat(60))).toBe(BUBBLE_MS.max);
  });

  it('shows the newest line of each fighter until its time is up', () => {
    const entries = [entry(1, 0, { text: 'old' }), entry(2, 1000, { text: 'new' }), entry(3, 0, { fighter: WEST, from: ADA, text: 'hi' })];
    const seen = new Set([WEST, EAST]);
    expect(bubblesAt(entries, 1500, seen)).toEqual(new Map([[EAST, 'new'], [WEST, 'hi']]));
    expect(bubblesAt(entries, 1000 + BUBBLE_MS.min + 1, seen)).toEqual(new Map());
  });

  it('draws no bubble over a fighter the viewer cannot see, nor for lobby lines or a rejoin\'s history', () => {
    const entries = [entry(1, 0), entry(2, 0, { fighter: null }), entry(3, 0, { fighter: WEST }, false)];
    expect(bubblesAt(entries, 10, new Set([WEST]))).toEqual(new Map());
  });
});

describe('the remembered channel', () => {
  it('starts on All, remembers Team, and falls back to All when storage is blocked', () => {
    const items = new Map<string, string>();
    const storage = { getItem: (k: string) => items.get(k) ?? null, setItem: (k: string, v: string) => void items.set(k, v) } as unknown as Storage;
    const memory = createChannelMemory(() => storage);
    expect(memory.load()).toBe('all');
    memory.save('team');
    expect(memory.load()).toBe('team');
    const blocked = createChannelMemory(() => {
      throw new Error('blocked');
    });
    expect(blocked.load()).toBe('all');
    expect(() => blocked.save('team')).not.toThrow();
  });
});
