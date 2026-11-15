import type { ChatFeed } from '../chat/chatFeed';
import type { ChatState } from '../chat/chatState';

/** The shipped tick, well under the game's own sounds: a line arriving should be noticed, not heard over a fight. */
export const CHAT_SOUND = { sound: 'tick', gain: 0.45, pan: 0 } as const;

/** Whether `next` holds a line someone else just said that `previous` did not: never your own, nor a rejoin's history. */
export function heardNew(previous: ChatState | null, next: ChatState): boolean {
  const last = previous?.entries.at(-1)?.line.seq ?? 0;
  return next.entries.some((e) => e.line.seq > last && e.live && !e.own);
}

/** Follows whichever feed is on show and calls `play` for each new line from someone else. Returns the unfollower. */
export function followChat(feed: ChatFeed, play: () => void): () => void {
  let seen: ChatState | null = feed.getSnapshot();
  return feed.subscribe(() => {
    const next = feed.getSnapshot();
    if (heardNew(seen, next)) play();
    seen = next;
  });
}
