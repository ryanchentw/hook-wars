import type { MemberId } from '@hookwars/room';
import type { PlayerId } from '@hookwars/sim';
import { describe, expect, it } from 'vitest';
import {
  CHAT_MAX_GRAPHEMES,
  CHAT_MAX_UNITS,
  chatTextFits,
  encodeServerMessage,
  graphemeCount,
  parseClientMessage,
  parseServerMessage,
  PROTOCOL_VERSION,
  sanitizeChatText,
  truncateGraphemes,
  type ServerMessage,
} from '../index';

const frame = (value: unknown): string => JSON.stringify(value);
const FAMILY = '👨‍👩‍👧‍👦';
const THUMB_DARK = '👍🏿';
const TECHNOLOGIST = '👩🏽‍💻';
const RAINBOW_FLAG = '🏳️‍🌈';
const SCOTLAND = '🏴󠁧󠁢󠁳󠁣󠁴󠁿';

describe('counting what a player sees', () => {
  it('counts a Chinese character, an accented letter and every emoji sequence once', () => {
    expect(graphemeCount('你好嗎')).toBe(3);
    expect(graphemeCount('é')).toBe(1);
    expect(graphemeCount(FAMILY)).toBe(1);
    expect(graphemeCount(THUMB_DARK)).toBe(1);
    expect(graphemeCount(`${TECHNOLOGIST}${RAINBOW_FLAG}${SCOTLAND}`)).toBe(3);
  });

  it('truncates without splitting a character or an emoji', () => {
    expect(truncateGraphemes(`哈${FAMILY}囉`, 2)).toBe(`哈${FAMILY}`);
    expect(truncateGraphemes(`${THUMB_DARK}${THUMB_DARK}`, 1)).toBe(THUMB_DARK);
    expect(truncateGraphemes('short', 10)).toBe('short');
  });

  it('allows sixty characters of any kind, and no more', () => {
    expect(chatTextFits('你'.repeat(CHAT_MAX_GRAPHEMES))).toBe(true);
    expect(chatTextFits('你'.repeat(CHAT_MAX_GRAPHEMES + 1))).toBe(false);
    expect(chatTextFits(FAMILY.repeat(CHAT_MAX_GRAPHEMES / 2))).toBe(true);
  });

  it('stops a line of stacked marks at the code unit bound even under sixty characters', () => {
    const zalgo = `a${'́'.repeat(20)}`.repeat(20);
    expect(graphemeCount(zalgo)).toBe(20);
    expect(zalgo.length).toBeGreaterThan(CHAT_MAX_UNITS);
    expect(chatTextFits(zalgo)).toBe(false);
  });
});

describe('cleaning a line', () => {
  it('trims and collapses whitespace runs, tabs, line breaks and ideographic spaces', () => {
    expect(sanitizeChatText('  gg \t\n  wp　　好  ')).toBe('gg wp 好');
  });

  it('strips controls, bidi overrides and isolates, and invisible characters', () => {
    expect(sanitizeChatText('a\u0000b\u0007c\u009Bd')).toBe('abcd');
    expect(sanitizeChatText('‮evil‬ ⁦x⁩ ‏y‎')).toBe('evil x y');
    expect(sanitizeChatText('zero​width﻿⁠')).toBe('zerowidth');
  });

  it('keeps emoji sequences with joiners, skin tones, variation selectors and tags whole', () => {
    const line = `${FAMILY} ${THUMB_DARK} ${TECHNOLOGIST} ${RAINBOW_FLAG} ${SCOTLAND}`;
    expect(sanitizeChatText(line)).toBe(line);
  });

  it('drops joiners with nothing to join, so they cannot pass for a message', () => {
    expect(sanitizeChatText('‍')).toBe('');
    expect(sanitizeChatText(' ‍‌ ')).toBe('');
    expect(sanitizeChatText('hi ‍ there‍')).toBe('hi there');
  });

  it('is idempotent and never lengthens a line', () => {
    const samples = ['  a‍ \u0001b ', `‮${FAMILY}​  x`, '‍‍', '你好\n\n世界', '<b>hi</b>'];
    samples.forEach((raw) => {
      const once = sanitizeChatText(raw);
      expect(sanitizeChatText(once)).toBe(once);
      expect(once.length).toBeLessThanOrEqual(raw.length);
      expect(graphemeCount(once)).toBeLessThanOrEqual(graphemeCount(raw));
    });
  });

  it('leaves markup as the characters it is', () => {
    expect(sanitizeChatText('<img src=x onerror=alert(1)>')).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('chat on the wire', () => {
  it('reads a chat message on either channel', () => {
    expect(parseClientMessage(frame({ t: 'chat', channel: 'all', text: '你好' }))).toEqual({ ok: true, value: { t: 'chat', channel: 'all', text: '你好' } });
    expect(parseClientMessage(frame({ t: 'chat', channel: 'team', text: 'go' })).ok).toBe(true);
  });

  it('refuses a wrong channel, a missing or extra field, and over-long text', () => {
    const hostile = [
      { t: 'chat', channel: 'whisper', text: 'hi' },
      { t: 'chat', channel: 'all' },
      { t: 'chat', channel: 'all', text: 'hi', from: 'm2' },
      { t: 'chat', channel: 'all', text: 7 },
      { t: 'chat', channel: 'all', text: 'x'.repeat(CHAT_MAX_UNITS + 1) },
    ];
    hostile.forEach((message) => expect(parseClientMessage(frame(message)).ok).toBe(false));
  });

  it('lets control characters through parsing, for the server to strip rather than drop the player', () => {
    expect(parseClientMessage(frame({ t: 'chat', channel: 'all', text: 'a\u0000‮b' })).ok).toBe(true);
  });

  it('carries a chat line, a history and the rate notice through the wire', () => {
    const line = { seq: 3, from: 'm1' as MemberId, name: 'Ada' as never, team: 'west' as const, fighter: 'west-0' as PlayerId, channel: 'team' as const, text: '<b>上</b>' };
    const messages: ServerMessage[] = [{ t: 'chat', line }, { t: 'chatLimited' }];
    messages.forEach((message) => expect(parseServerMessage(encodeServerMessage(message))).toEqual({ ok: true, value: message }));
  });

  it('refuses a line with no speaker or empty text, and a welcome without its history', () => {
    expect(parseServerMessage(frame({ t: 'chat', line: { seq: 1, name: 'Ada', team: null, fighter: null, channel: 'all', text: 'x' } })).ok).toBe(false);
    expect(parseServerMessage(frame({ t: 'chat', line: { seq: 1, from: 'm1', name: 'Ada', team: null, fighter: null, channel: 'all', text: '' } })).ok).toBe(false);
    const welcome = { t: 'welcome', v: PROTOCOL_VERSION, code: 'ABCDEF', you: 'm1', token: 'a'.repeat(32), lobby: { room: {}, away: [] }, match: null };
    expect(parseServerMessage(frame(welcome)).ok).toBe(false);
  });
});
