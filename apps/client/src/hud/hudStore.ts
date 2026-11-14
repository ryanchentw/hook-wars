import type { Session } from '../game/session';
import { appendKills, deriveHud, type HudView, type KillFeedEntry } from './hudView';

export type HudStore = {
  subscribe(onChange: () => void): () => void;
  getSnapshot(): HudView;
  playAgain(): void;
};

/** Recomputes the HUD once per sim tick, never per animation frame, and caches it for `useSyncExternalStore`. */
export function createHudStore(session: Session): HudStore {
  const listeners = new Set<() => void>();
  let feed: readonly KillFeedEntry[] = [];
  let snapshot = deriveHud(session.getState(), session.localPlayerId, feed);

  session.subscribe((state, change) => {
    feed = change === 'reset' ? [] : appendKills(feed, state);
    snapshot = deriveHud(state, session.localPlayerId, feed);
    listeners.forEach((l) => l());
  });

  return {
    subscribe(onChange) {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    getSnapshot: () => snapshot,
    playAgain: () => session.restart(),
  };
}
