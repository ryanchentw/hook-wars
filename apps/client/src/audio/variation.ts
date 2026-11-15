import type { SoundSpec } from './manifest';

export type Random = () => number;

const SEMITONES_PER_OCTAVE = 12;
const DB_PER_DECADE = 20;

/** An index into `count` variants, never `last` again while there is another to pick. */
export function pickVariant(count: number, last: number | null, random: Random): number {
  if (count <= 1) return 0;
  const offered = last === null ? count : count - 1;
  const pick = Math.min(offered - 1, Math.floor(random() * offered));
  return last !== null && pick >= last ? pick + 1 : pick;
}

/** A playback rate and gain within the sound's spread, so a brawl of the same blow does not ring the same each time. */
export function vary(spec: Pick<SoundSpec, 'pitch' | 'jitterDb'>, random: Random): { readonly rate: number; readonly gain: number } {
  const swing = (spread: number): number => spread * (random() * 2 - 1);
  return { rate: 2 ** (swing(spec.pitch) / SEMITONES_PER_OCTAVE), gain: 10 ** (swing(spec.jitterDb) / DB_PER_DECADE) };
}
