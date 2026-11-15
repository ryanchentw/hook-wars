/** Who hears a chat line: everyone in the room, or the speaker's own side. */
export const CHAT_CHANNELS = ['all', 'team'] as const;
export type ChatChannel = (typeof CHAT_CHANNELS)[number];

/** What a player sees as characters: a Chinese character, a letter with its accent, or a whole emoji family counts once. */
export const CHAT_MAX_GRAPHEMES = 60;
/**
 * A second bound, in UTF-16 code units, so a line of stacked combining marks or long emoji sequences cannot grow without
 * end. At three UTF-8 bytes a unit at most, a full line stays well inside `MAX_CLIENT_MESSAGE_BYTES`.
 */
export const CHAT_MAX_UNITS = 400;
/** The lines a room keeps so a player who drops and comes back sees what was just said. */
export const CHAT_HISTORY_MAX = 8;

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export const graphemes = (text: string): readonly string[] => Array.from(segmenter.segment(text), (s) => s.segment);

export const graphemeCount = (text: string): number => graphemes(text).length;

/** The first `max` user-perceived characters, never splitting one. */
export function truncateGraphemes(text: string, max: number): string {
  const parts = graphemes(text);
  return parts.length <= max ? text : parts.slice(0, max).join('');
}

/** Both bounds, measured the same way by the client before it sends and by the server when it receives. */
export const chatTextFits = (text: string): boolean => text.length <= CHAT_MAX_UNITS && graphemeCount(text) <= CHAT_MAX_GRAPHEMES;

/**
 * Characters that draw nothing yet can hide or reorder the text around them: C0 and C1 controls other than the
 * whitespace ones, the soft hyphen, the bidi marks, embeddings, overrides and isolates, zero-width space, word joiner
 * and the invisible operators, the byte-order mark and the interlinear annotation marks.
 */
const HIDDEN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F­؜᠎​‎‏‪-‮⁠-⁤⁦-⁯﻿￹-￻]/gu;
/** A joiner with nothing to join on one side: the only kind left after HIDDEN that can be typed to smuggle in blank text. */
const LOOSE_JOINER = /(^|\s)[‌‍]+|[‌‍]+(?=\s|$)/gu;
const ONLY_FORMAT = /^\p{Cf}+$/u;

/**
 * The one form a chat line is shown in. Joiners inside an emoji or a word stay, so families, flags and skin tones
 * survive; whitespace runs, tabs and line breaks become one space. Idempotent, and never makes a line longer.
 */
export function sanitizeChatText(raw: string): string {
  const visible = raw.replace(HIDDEN, '').replace(LOOSE_JOINER, '$1');
  const kept = graphemes(visible)
    .filter((g) => !ONLY_FORMAT.test(g))
    .join('');
  return kept.replace(/\s+/gu, ' ').trim();
}
