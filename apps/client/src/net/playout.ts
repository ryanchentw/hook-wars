/**
 * Which moment of the server's match is being drawn. `offset` is this clock minus the server's, learned from when
 * snapshots arrive; `time` is the server time on screen, or null before the first snapshot.
 */
export type Playout = { readonly offset: number | null; readonly time: number | null };

export type PlayoutRules = {
  readonly delay: number;
  readonly gain: number;
  readonly maxSpeedUp: number;
  readonly maxSlowDown: number;
  readonly snap: number;
  readonly drift: number;
};

export const NO_PLAYOUT: Playout = { offset: null, time: null };

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/**
 * Learns the clock offset from a snapshot stamped `serverTime` that arrived at `now`. The quickest packet seen is the
 * truest measure, so a smaller offset is taken at once and a larger one only creeps in: one late snapshot does not
 * drag the picture back.
 */
export function observeSnapshot(playout: Playout, serverTime: number, now: number, rules: PlayoutRules): Playout {
  const sample = now - serverTime;
  if (playout.offset === null || sample < playout.offset) return { ...playout, offset: sample };
  return { ...playout, offset: playout.offset + (sample - playout.offset) * rules.drift };
}

/**
 * Moves the drawn moment on by `dt` of real time, steering it to sit `delay` behind the server. It runs a little fast
 * or slow to close a small error, jumps to close a large one, never runs backwards, and never passes `newest`, the
 * time of the latest snapshot held.
 */
export function advancePlayout(playout: Playout, dt: number, now: number, newest: number | null, rules: PlayoutRules): Playout {
  if (playout.offset === null || newest === null) return playout;
  const target = Math.min(newest, now - playout.offset - rules.delay);
  if (playout.time === null) return { ...playout, time: target };
  const error = target - playout.time;
  if (Math.abs(error) > rules.snap) return { ...playout, time: Math.max(playout.time, target) };
  const rate = 1 + clamp(error * rules.gain, -rules.maxSlowDown, rules.maxSpeedUp);
  return { ...playout, time: clamp(playout.time + dt * rate, playout.time, newest) };
}
