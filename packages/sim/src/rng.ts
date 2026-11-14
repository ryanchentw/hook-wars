import type { Rng } from './types';

export function createRng(seed: number): Rng {
  return { seed: seed >>> 0 };
}

/** Returns a float in [0, 1) and the advanced RNG. Mulberry32. */
export function nextRandom(rng: Rng): readonly [number, Rng] {
  const seed = (rng.seed + 0x6d2b79f5) >>> 0;
  let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, { seed }];
}
