/** Why the match might be held. Each is raised and lowered on its own; the match runs only when none that holds it is up. */
export type PauseReason = 'credits' | 'intro' | 'menu';

/**
 * Which reasons stop the clock. This is the one place that decides it: a local match may stop for anything, but a match
 * played over the network runs on the server's clock, so there the credits and the pause menu will have to leave it running.
 */
export const HOLDS_MATCH: Readonly<Record<PauseReason, boolean>> = { credits: true, intro: true, menu: true };

export type PauseGate = { set(reason: PauseReason, held: boolean): void };

/** Folds several reasons to pause into the one switch a session has, telling it only when the answer changes. */
export function createPauseGate(apply: (paused: boolean) => void, holds: Readonly<Record<PauseReason, boolean>> = HOLDS_MATCH): PauseGate {
  let held: ReadonlySet<PauseReason> = new Set();
  return {
    set(reason, raised) {
      const on = raised && holds[reason];
      if (held.has(reason) === on) return;
      const was = held.size > 0;
      held = new Set(on ? [...held, reason] : [...held].filter((r) => r !== reason));
      if (held.size > 0 !== was) apply(held.size > 0);
    },
  };
}
