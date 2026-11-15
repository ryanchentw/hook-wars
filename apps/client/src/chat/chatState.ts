import { CHAT_MAX_GRAPHEMES, CHAT_MAX_UNITS, graphemes, type ChatChannel, type ChatLine } from '@hookwars/protocol';

/**
 * A line as this client holds it. `at` is when it arrived, in `performance.now()` milliseconds. `live` is false for
 * the lines a rejoin brings back: they go in the log but pop no bubble and play no sound.
 */
export type ChatEntry = { readonly line: ChatLine; readonly at: number; readonly own: boolean; readonly live: boolean };

/** `limitedAt`: when the server last said a line of ours was dropped for coming too fast. */
export type ChatState = { readonly entries: readonly ChatEntry[]; readonly limitedAt: number | null };

export const EMPTY_CHAT: ChatState = { entries: [], limitedAt: null };

/** Enough for the lobby's scrolling log; the match shows only the last few. */
export const CHAT_KEPT = 100;

/** Adds lines not already held, in the order the room numbered them. */
export function addLines(state: ChatState, entries: readonly ChatEntry[]): ChatState {
  const held = new Set(state.entries.map((e) => e.line.seq));
  const fresh = entries.filter((e) => !held.has(e.line.seq));
  if (fresh.length === 0) return state;
  const all = [...state.entries, ...fresh].sort((a, b) => a.line.seq - b.line.seq);
  return { ...state, entries: all.slice(-CHAT_KEPT) };
}

/** The draft cut back to what may be sent, never splitting a character. Used once a composition is over, never during one. */
export function clampDraft(text: string): string {
  const kept = graphemes(text).slice(0, CHAT_MAX_GRAPHEMES);
  while (kept.join('').length > CHAT_MAX_UNITS) kept.pop();
  return kept.join('');
}

/** Characters left before the limit, shown only once the player is close to it. */
export const COUNTER_FROM = 50;

export const otherChannel = (channel: ChatChannel): ChatChannel => (channel === 'all' ? 'team' : 'all');
