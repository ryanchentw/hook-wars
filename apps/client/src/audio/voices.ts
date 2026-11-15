/** A sound now playing, as the limiter needs to know it. Times are seconds on the audio clock. */
export type ActiveVoice = { readonly id: number; readonly sound: string; readonly startedAt: number; readonly endsAt: number; readonly gain: number };

export type VoiceRequest = { readonly sound: string; readonly gain: number };

export type VoiceLimits = {
  /** Voices playing at once, all sounds together. */
  readonly total: number;
  /** Voices of one sound playing at once. */
  readonly perSound: number;
  /** Seconds within which a second start of the same sound is the same sound. */
  readonly collapse: number;
};

export const VOICE_LIMITS: VoiceLimits = { total: 16, perSound: 4, collapse: 0.04 };

/** Which of the asked-for sounds start, and which playing voices stop to make room. */
export type VoicePlan<R extends VoiceRequest> = { readonly start: readonly R[]; readonly steal: readonly number[] };

/** The loudest request of each sound; a storm bolt on six fighters is one bolt. */
function loudestEach<R extends VoiceRequest>(requests: readonly R[]): readonly R[] {
  const best = requests.reduce((acc, r) => {
    const held = acc.get(r.sound);
    return held !== undefined && held.gain >= r.gain ? acc : new Map(acc).set(r.sound, r);
  }, new Map<string, R>());
  return [...best.values()].sort((a, b) => b.gain - a.gain);
}

type Step<R extends VoiceRequest> = { readonly active: readonly ActiveVoice[]; readonly start: readonly R[]; readonly steal: readonly number[] };

function place<R extends VoiceRequest>(step: Step<R>, request: R, now: number, limits: VoiceLimits): Step<R> {
  const same = step.active.filter((v) => v.sound === request.sound);
  if (same.some((v) => now - v.startedAt < limits.collapse) || same.length >= limits.perSound) return step;
  const added: ActiveVoice = { id: -1, sound: request.sound, startedAt: now, endsAt: Number.POSITIVE_INFINITY, gain: request.gain };
  if (step.active.length < limits.total) return { ...step, active: [...step.active, added], start: [...step.start, request] };
  const quietest = step.active.reduce((q, v) => (v.gain < q.gain ? v : q));
  if (quietest.gain >= request.gain || quietest.id < 0) return step;
  return {
    active: [...step.active.filter((v) => v !== quietest), added],
    start: [...step.start, request],
    steal: [...step.steal, quietest.id],
  };
}

/** Decides what of one batch of sounds plays, given what is already playing. */
export function admit<R extends VoiceRequest>(active: readonly ActiveVoice[], requests: readonly R[], now: number, limits: VoiceLimits): VoicePlan<R> {
  const playing = active.filter((v) => v.endsAt > now);
  const done = loudestEach(requests).reduce<Step<R>>((step, r) => place(step, r, now, limits), { active: playing, start: [], steal: [] });
  return { start: done.start, steal: done.steal };
}
