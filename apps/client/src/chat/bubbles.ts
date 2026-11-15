import { graphemeCount } from '@hookwars/protocol';
import type { PlayerId } from '@hookwars/sim';
import type { ChatEntry } from './chatState';

/** A short taunt stays up long enough to read; a long one longer, within bounds. */
export const BUBBLE_MS = { base: 2500, perCharacter: 90, min: 3000, max: 7000 } as const;

export const bubbleMs = (text: string): number =>
  Math.min(BUBBLE_MS.max, Math.max(BUBBLE_MS.min, BUBBLE_MS.base + BUBBLE_MS.perCharacter * graphemeCount(text)));

export type Bubbles = ReadonlyMap<PlayerId, string>;

/**
 * The bubble over each fighter at `now`: their latest line still within its time, a newer one replacing an older.
 * Only fighters in `visible` get one, so a line never gives away where a hidden speaker stands.
 */
export function bubblesAt(entries: readonly ChatEntry[], now: number, visible: ReadonlySet<PlayerId>): Bubbles {
  const latest = new Map<PlayerId, ChatEntry>();
  entries.forEach((e) => {
    if (e.live && e.line.fighter !== null) latest.set(e.line.fighter, e);
  });
  const shown = [...latest].filter(([id, e]) => visible.has(id) && now - e.at < bubbleMs(e.line.text));
  return new Map(shown.map(([id, e]) => [id, e.line.text]));
}
