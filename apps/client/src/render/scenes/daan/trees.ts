import { seeded } from '../kit/canvas';
import { ball, post, type Part } from '../kit/parts';
import { DAAN_COLORS as C } from './look';

export type TreeSpec = {
  readonly x: number;
  readonly z: number;
  /** Height of the underside of the canopy, and how far the canopy spreads from the trunk. */
  readonly clear: number;
  readonly spread: number;
  readonly seed: number;
  /** Too far off to be looked at closely or to shade anything in play: drawn coarser, and casting no shadow. */
  readonly distant?: boolean;
};

const LEAF_TONES = [C.leaf, C.leafLight, C.leafDark, C.leaf, C.leafLight];
const CANOPY_MASSES = 16;
/** Aerial roots are paler than the trunk they hang beside. */
const ROOT_TINT = 0xffe8d0;

function tone(of: number): number {
  // Paint colours multiply, so a tone is given as its ratio to the base leaf green, channel by channel.
  const channel = (shift: number): number => Math.min(255, Math.round((((of >> shift) & 0xff) / ((C.leaf >> shift) & 0xff)) * 255));
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/**
 * A banyan: several trunks grown together, a broad low canopy of leaf masses, and aerial roots let down from the
 * boughs. Nothing of it reaches further from the trunk than `spread`.
 */
export function banyan(spec: TreeSpec): readonly Part[] {
  const random = seeded(spec.seed);
  const trunks = [0, 1, 2, 3, 4].map((i) => {
    const a = (i / 5) * Math.PI * 2 + random();
    const out = i === 0 ? 0 : 0.4 + random() * 0.3;
    return post('bark', { radius: 0.5 - i * 0.06, topRadius: 0.3 - i * 0.03, height: spec.clear + 0.6, sides: 7 }, { x: spec.x + Math.cos(a) * out, y: 0, z: spec.z + Math.sin(a) * out });
  });
  // Buttressed where the trunks meet the ground.
  const foot = post('bark', { radius: 1.15, topRadius: 0.5, height: 0.7, sides: 9 }, { x: spec.x, y: 0, z: spec.z });
  // An outer ring of small masses makes the ragged edge, an inner ring the bulk, and one on top the dome.
  const masses = Array.from({ length: CANOPY_MASSES }, (_, i) => {
    const outer = i < CANOPY_MASSES * 0.6;
    const a = (i / (CANOPY_MASSES * 0.6)) * Math.PI * 2 + random() * 0.6;
    const radius = spec.spread * (outer ? 0.24 + random() * 0.1 : 0.36 + random() * 0.1);
    const out = i === CANOPY_MASSES - 1 ? 0 : (spec.spread - radius) * (outer ? 0.85 + random() * 0.15 : 0.3 + random() * 0.25);
    const y = spec.clear + radius * 0.45 + (outer ? random() * 0.5 : 0.7 + random() * 0.8);
    const leaf = LEAF_TONES[i % LEAF_TONES.length] ?? C.leaf;
    const at = { x: spec.x + Math.cos(a) * out, y, z: spec.z + Math.sin(a) * out };
    return ball(spec.distant ? 'leafFar' : 'leaf', radius, at, { stretch: { x: 1, y: 0.58, z: 1 }, tint: tone(leaf), detail: spec.distant ? 0 : 1 });
  });
  const roots = Array.from({ length: 9 }, () => {
    const a = random() * Math.PI * 2;
    const out = spec.spread * (0.3 + random() * 0.35);
    return post('bark', { radius: 0.045, height: spec.clear + 0.3, sides: 4 }, { x: spec.x + Math.cos(a) * out, y: 0, z: spec.z + Math.sin(a) * out }, { tint: ROOT_TINT });
  });
  return [...trunks, foot, ...masses, ...roots];
}

export type ShadeSpec = { readonly x: readonly [number, number]; readonly z: readonly [number, number]; readonly height: readonly [number, number]; readonly count: number; readonly seed: number };

/** Leaf masses with gaps between them, laid out around the origin of a box, to be hung high and cast broken shade. */
export function boughs(spec: ShadeSpec): readonly Part[] {
  const random = seeded(spec.seed);
  return Array.from({ length: spec.count }, () => {
    const radius = 0.4 + random() * 0.7;
    const at = {
      x: spec.x[0] + random() * (spec.x[1] - spec.x[0]),
      y: spec.height[0] + random() * (spec.height[1] - spec.height[0]),
      z: spec.z[0] + random() * (spec.z[1] - spec.z[0]),
    };
    // Only its shadow is ever seen, so a flat disc with enough sides to throw a round one will do.
    return post('shade', { radius, height: 0.05, sides: 11 }, at, { stretch: { x: 1.3, y: 1, z: 1 } });
  });
}
