/** Why the match is held. Each is raised and lowered on its own; the match runs only when none is up. */
export type PauseReason = 'credits' | 'intro';

export type PauseGate = { set(reason: PauseReason, held: boolean): void };

/** Folds several reasons to pause into the one switch a session has, telling it only when the answer changes. */
export function createPauseGate(apply: (paused: boolean) => void): PauseGate {
  let held: ReadonlySet<PauseReason> = new Set();
  return {
    set(reason, on) {
      if (held.has(reason) === on) return;
      const was = held.size > 0;
      held = new Set(on ? [...held, reason] : [...held].filter((r) => r !== reason));
      if (held.size > 0 !== was) apply(held.size > 0);
    },
  };
}
