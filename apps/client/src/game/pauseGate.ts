/** Why the match might be held. Each is raised and lowered on its own; the match runs only when none that holds it is up. */
export type PauseReason = 'credits' | 'intro' | 'menu';

export type Holds = Readonly<Record<PauseReason, boolean>>;

/**
 * Which reasons stop the clock. This is the one place that decides it: a local match may stop for anything, but an
 * online match runs on the server's clock and is every player's, so nothing one of them opens can hold it.
 */
export const HOLDS_MATCH: Holds = { credits: true, intro: true, menu: true };
export const HOLDS_ONLINE: Holds = { credits: false, intro: false, menu: false };

export type PauseGate = { set(reason: PauseReason, held: boolean): void };

/** Folds several reasons to pause into the one switch a session has, telling it only when the answer changes. */
export function createPauseGate(apply: (paused: boolean) => void, holds: Holds = HOLDS_MATCH): PauseGate {
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
