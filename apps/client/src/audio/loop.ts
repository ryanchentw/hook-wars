import type { TrackSpec } from './manifest';

/** Seconds into a clip where its sound starts and stops, past whatever silence the encoder padded it with. */
export type Bounds = { readonly start: number; readonly end: number };

/** About -60 dBFS: below anything the shipped files hold inside their content. */
export const SILENCE_THRESHOLD = 0.001;
/** No overlap may leave a pass shorter than this share of its length. */
const MIN_PERIOD_SHARE = 0.5;

function firstLoud(samples: Float32Array, threshold: number): number {
  const i = samples.findIndex((x) => Math.abs(x) > threshold);
  return i === -1 ? samples.length : i;
}

function lastLoud(samples: Float32Array, threshold: number): number {
  for (let i = samples.length - 1; i >= 0; i -= 1) if (Math.abs(samples[i] ?? 0) > threshold) return i;
  return -1;
}

/**
 * Browsers differ on whether they strip an MP3's encoder delay, so the content is found in the decoded samples
 * rather than trusted to start at zero.
 */
export function contentBounds(channels: readonly Float32Array[], sampleRate: number, threshold: number): Bounds {
  const first = Math.min(...channels.map((c) => firstLoud(c, threshold)));
  const last = Math.max(...channels.map((c) => lastLoud(c, threshold)));
  if (last < first) return { start: 0, end: 0 };
  return { start: first / sampleRate, end: (last + 1) / sampleRate };
}

/** One pass of a looping track: where in the clip it plays from, for how long, and when the next one starts. */
export type LoopPass = { readonly offset: number; readonly length: number; readonly period: number; readonly fadeIn: number; readonly fadeOut: number };

export function loopPass(bounds: Bounds, spec: Pick<TrackSpec, 'overlap' | 'fadeIn'>): LoopPass {
  const length = bounds.end - bounds.start;
  const overlap = Math.min(spec.overlap, length * MIN_PERIOD_SHARE);
  return { offset: bounds.start, length, period: length - overlap, fadeIn: spec.fadeIn, fadeOut: overlap };
}
