import type { Motion } from '../kit/motion';
import { ball, post, type Part } from '../kit/parts';

/** An island does not bob. */
export const ISLAND_MOTION: Motion = { bob: 0, bobRate: 0, tilt: 0, tiltRate: 0, drift: 0, driftRate: 0 };

const WALL_TOP = 0.75;
const HEDGE = { radius: 0.66, count: 11, height: 1.25 };
const TREE = { trunk: 2.5, foot: WALL_TOP };

/** Where the egrets stand: polar position on the island and the height of what they stand on. */
const EGRETS = [
  { angle: 1.0, out: 1.55, perch: 2.0, heading: 0.3 },
  { angle: 2.3, out: 1.5, perch: 2.0, heading: 2.6 },
  { angle: 4.6, out: 1.45, perch: 2.0, heading: 5.2 },
] as const;
/** Egrets are drawn a little over life size: at life size one is three pixels of white. */
const EGRET_SCALE = 1.5;

/** A white egret standing: two thin legs, a small body, an S of neck and a dagger of a bill. */
function egret(e: (typeof EGRETS)[number]): readonly Part[] {
  const x = Math.cos(e.angle) * e.out;
  const z = Math.sin(e.angle) * e.out;
  const fx = Math.cos(e.heading);
  const fz = Math.sin(e.heading);
  const k = EGRET_SCALE;
  return [
    post('egretLeg', { radius: 0.02 * k, height: 0.3 * k, sides: 4 }, { x: x - fz * 0.04 * k, y: e.perch, z: z + fx * 0.04 * k }),
    post('egretLeg', { radius: 0.02 * k, height: 0.3 * k, sides: 4 }, { x: x + fz * 0.04 * k, y: e.perch, z: z - fx * 0.04 * k }),
    ball('egret', 0.17 * k, { x, y: e.perch + 0.42 * k, z }, { stretch: { x: 1.5, y: 0.9, z: 0.85 }, yaw: -e.heading }),
    post('egret', { radius: 0.04 * k, topRadius: 0.035 * k, height: 0.36 * k, sides: 5 }, { x: x + fx * 0.2 * k, y: e.perch + 0.46 * k, z: z + fz * 0.2 * k }),
    ball('egret', 0.065 * k, { x: x + fx * 0.24 * k, y: e.perch + 0.86 * k, z: z + fz * 0.24 * k }, { stretch: { x: 1.3, y: 1, z: 1 }, yaw: -e.heading }),
  ];
}

/**
 * The pond's island: a ring of rockery walled to the sim's circle, a clipped hedge standing on it to above hook
 * height so a hook visibly strikes something, a small tree, and egrets. Heights are from the lawns.
 */
export function island(radius: number, waterLevel: number): readonly Part[] {
  const hedge = Array.from({ length: HEDGE.count }, (_, i) => {
    const a = (i / HEDGE.count) * Math.PI * 2;
    const out = radius - HEDGE.radius;
    const at = { x: Math.cos(a) * out, y: WALL_TOP + HEDGE.height * 0.45, z: Math.sin(a) * out };
    return ball('shrub', HEDGE.radius, at, { stretch: { x: 1, y: HEDGE.height / (2 * HEDGE.radius) + 0.35, z: 1 }, tint: i % 3 === 0 ? 0xd8ffd0 : 0xffffff });
  });
  const crown = [
    { x: 0, y: 0.9, z: 0, r: 1.15 },
    { x: 0.7, y: 0.35, z: 0.3, r: 0.85 },
    { x: -0.6, y: 0.45, z: -0.4, r: 0.9 },
    { x: -0.1, y: 0.3, z: 0.75, r: 0.75 },
  ].map((m, i) => ball('leaf', m.r, { x: m.x, y: TREE.foot + TREE.trunk + m.y, z: m.z }, { stretch: { x: 1, y: 0.7, z: 1 }, tint: i % 2 === 0 ? 0xffffff : 0xe0ffc8 }));
  return [
    post('rock', { radius, height: WALL_TOP - (waterLevel - 0.6), sides: 22 }, { x: 0, y: waterLevel - 0.6, z: 0 }),
    post('shrub', { radius: radius * 0.86, height: 0.5, sides: 16 }, { x: 0, y: WALL_TOP, z: 0 }),
    ...hedge,
    post('bark', { radius: 0.2, topRadius: 0.13, height: TREE.trunk, sides: 7 }, { x: 0, y: TREE.foot, z: 0 }),
    ...crown,
    ...EGRETS.flatMap(egret),
  ];
}
