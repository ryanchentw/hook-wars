import type { SeenEvent, Grapple, Hook, SeenPlayer, PlayerId } from '@hookbrawl/sim';

export type AnimState = 'idle' | 'run' | 'throw' | 'hold' | 'swing' | 'flinch' | 'dragged' | 'stagger' | 'brace' | 'haul' | 'death';

/** `once` returns to a resting state when the clip ends; `clamp` stays on the clip's last frame. */
export type Playback = 'loop' | 'once' | 'clamp';

export type AnimSpec = {
  readonly clip: string;
  readonly playback: Playback;
  /** Seconds of cross-fade when entering this state. */
  readonly fadeIn: number;
  readonly timeScale: number;
  /** Fraction of the clip to skip, so a one-shot can open on its action instead of its wind-up. */
  readonly startAt: number;
  /** Fraction of the clip at which a one-shot counts as finished, cutting off its recovery. */
  readonly endAt: number;
};

/** The one table that decides which clip a character plays in each state. */
export const ANIMATIONS: Readonly<Record<AnimState, AnimSpec>> = {
  idle: { clip: 'Idle', playback: 'loop', fadeIn: 0.22, timeScale: 1, startAt: 0, endAt: 1 },
  run: { clip: 'Running_A', playback: 'loop', fadeIn: 0.14, timeScale: 1.15, startAt: 0, endAt: 1 },
  // The hook is already in the air on the cast tick, so the clip opens just before its release.
  throw: { clip: 'Throw', playback: 'once', fadeIn: 0.05, timeScale: 1.25, startAt: 0.28, endAt: 0.62 },
  hold: { clip: '1H_Ranged_Aiming', playback: 'loop', fadeIn: 0.12, timeScale: 1, startAt: 0, endAt: 1 },
  // A melee event is the moment of contact, so the clip opens with the hook already across the body and in front,
  // and with no cross-fade: the hit-stop freezes this first frame, and a blend would freeze a half-raised arm.
  swing: { clip: '1H_Melee_Attack_Slice_Horizontal', playback: 'once', fadeIn: 0, timeScale: 1, startAt: 0.235, endAt: 0.5 },
  flinch: { clip: 'Hit_A', playback: 'once', fadeIn: 0.05, timeScale: 1.4, startAt: 0, endAt: 0.8 },
  dragged: { clip: 'Jump_Idle', playback: 'loop', fadeIn: 0.08, timeScale: 1.6, startAt: 0, endAt: 1 },
  // Set down hard: the player cannot act for `TUNING.landingStagger`, and has to be able to see why.
  stagger: { clip: 'Hit_B', playback: 'loop', fadeIn: 0.05, timeScale: 1.2, startAt: 0, endAt: 1 },
  // Feet planted and the body set against the line while the head is in the air.
  brace: { clip: 'Blocking', playback: 'loop', fadeIn: 0.06, timeScale: 1, startAt: 0, endAt: 1 },
  haul: { clip: 'Jump_Idle', playback: 'loop', fadeIn: 0.1, timeScale: 1, startAt: 0, endAt: 1 },
  death: { clip: 'Death_A', playback: 'clamp', fadeIn: 0.08, timeScale: 1, startAt: 0, endAt: 1 },
};

export const REQUIRED_CLIPS: readonly string[] = [...new Set(Object.values(ANIMATIONS).map((spec) => spec.clip))];

export type AnimFacts = {
  readonly status: SeenPlayer['status']['kind'];
  readonly moving: boolean;
  readonly hookOut: boolean;
  readonly grapple: Grapple['phase']['kind'] | null;
};

export type AnimTrigger = 'cast' | 'strike' | 'hurt';

/** First matching row wins. The `forced` rows cut through any one-shot; the rest wait for it to end. */
const RESTING: readonly { readonly when: (f: AnimFacts) => boolean; readonly state: AnimState; readonly forced: boolean }[] = [
  { when: (f) => f.status === 'dead', state: 'death', forced: true },
  { when: (f) => f.status === 'dragged', state: 'dragged', forced: true },
  { when: (f) => f.status === 'staggered', state: 'stagger', forced: true },
  { when: (f) => f.grapple === 'pulling', state: 'haul', forced: true },
  { when: (f) => f.grapple === 'flying', state: 'brace', forced: true },
  { when: (f) => f.moving, state: 'run', forced: false },
  { when: (f) => f.hookOut, state: 'hold', forced: false },
  { when: () => true, state: 'idle', forced: false },
];

/** Highest priority first: what the player did beats what was done to them in the same tick. */
const TRIGGERED: readonly { readonly trigger: AnimTrigger; readonly state: AnimState }[] = [
  { trigger: 'cast', state: 'throw' },
  { trigger: 'strike', state: 'swing' },
  { trigger: 'hurt', state: 'flinch' },
];

export function factsFor(player: SeenPlayer, hooks: readonly Hook[], grapples: readonly Grapple[]): AnimFacts {
  return {
    status: player.status.kind,
    moving: player.move.kind !== 'idle',
    hookOut: hooks.some((h) => h.ownerId === player.id),
    grapple: grapples.find((g) => g.ownerId === player.id)?.phase.kind ?? null,
  };
}

export function triggersFor(playerId: PlayerId, events: readonly SeenEvent[]): readonly AnimTrigger[] {
  return events.flatMap((e): readonly AnimTrigger[] => {
    switch (e.kind) {
      case 'hookCast':
        return e.ownerId === playerId ? ['cast'] : [];
      case 'melee':
        return [...(e.attackerId === playerId ? (['strike'] as const) : []), ...(e.targetId === playerId ? (['hurt'] as const) : [])];
      case 'hookHit':
        return e.targetId === playerId ? ['hurt'] : [];
      case 'hookBounce':
      case 'kill':
      case 'respawn':
      case 'matchEnd':
      case 'purchase':
      case 'grappleCast':
      case 'grappleLand':
      case 'grappleArrive':
        return [];
    }
  });
}

/**
 * @param clipFinished whether the current state's clip has played to its end; only one-shots care.
 */
export function nextAnimState(
  current: AnimState,
  facts: AnimFacts,
  triggers: readonly AnimTrigger[],
  clipFinished: boolean,
): AnimState {
  const resting = RESTING.find((row) => row.when(facts));
  if (resting === undefined) return current;
  if (resting.forced) return resting.state;
  const triggered = TRIGGERED.find((row) => triggers.includes(row.trigger));
  if (triggered !== undefined) return triggered.state;
  if (ANIMATIONS[current].playback === 'once' && !clipFinished) return current;
  return resting.state;
}

/** A respawn moves the body to the spawn point, so blending out of the death pose would smear it across the dock. */
export function fadeDuration(from: AnimState, to: AnimState): number {
  return from === 'death' ? 0 : ANIMATIONS[to].fadeIn;
}
