import type { Motion } from '../kit/motion';
import { ball, post, ring, type Part } from '../kit/parts';
import { GATE_COLORS as C } from './look';

export const FLOAT_MOTION: Motion = { bob: 0.07, bobRate: 0.9, tilt: 0.02, tiltRate: 0.6, drift: 0, driftRate: 0 };

/** The float's deck stands this far above the pier decks: past hook height, so a hook visibly strikes timber. */
const DECK = 1.95;
const TYRES = { count: 11, radius: 0.3, tube: 0.07, height: 0.8 };

type Lounger = { readonly angle: number; readonly out: number; readonly heading: number; readonly size: number; readonly up: boolean };

/** Where the sea lions lie: polar position on the deck, which way each points, and whether its head is up. */
const LOUNGERS: readonly Lounger[] = [
  { angle: 0.5, out: 1.0, heading: 1.2, size: 1.2, up: true },
  { angle: 2.5, out: 1.05, heading: 3.4, size: 1.05, up: false },
  { angle: 4.3, out: 0.95, heading: 5.3, size: 1.25, up: true },
  { angle: 5.6, out: 0.35, heading: 2.2, size: 0.8, up: false },
];

/** One sea lion: a long wet body tapering to hind flippers, fore flippers spread on the deck, a thick neck and a dog's head, raised to bark or laid flat. */
function seaLion(l: Lounger): readonly Part[] {
  const s = l.size;
  const fx = Math.cos(l.heading);
  const fz = Math.sin(l.heading);
  const centre = { x: Math.cos(l.angle) * l.out, z: Math.sin(l.angle) * l.out };
  /** A point `along` the animal from its middle and `across` to its right, at `up` above the deck. */
  const at = (along: number, across: number, up: number) => ({ x: centre.x + (fx * along - fz * across) * s, y: DECK + up * s, z: centre.z + (fz * along + fx * across) * s });
  const tint = l.size < 0.9 ? C.seaLionPale : 0xffffff;
  const turned = { yaw: -l.heading, tint };
  const lift = l.up ? 0.42 : 0;
  return [
    ball('seaLion', 0.4, at(-0.1, 0, 0.28), { ...turned, stretch: { x: 1.9 * s, y: 0.7 * s, z: 0.9 * s }, detail: 2 }),
    ball('seaLion', 0.3, at(0.52, 0, 0.36 + lift * 0.6), { tint, stretch: { x: s, y: (l.up ? 1.5 : 0.9) * s, z: s } }),
    ball('seaLion', 0.2, at(0.66, 0, 0.42 + lift * 1.5), { ...turned, stretch: { x: 1.3 * s, y: 0.95 * s, z: 0.95 * s } }),
    ball('seaLion', 0.1, at(0.88, 0, 0.4 + lift * 1.5), { ...turned, stretch: { x: 1.2 * s, y: 0.8 * s, z: 0.9 * s } }),
    ...[-1, 1].map((side) => ball('seaLion', 0.22, at(0.4, side * 0.42, 0.06), { ...turned, stretch: { x: 1.3 * s, y: 0.22 * s, z: 0.8 * s } })),
    ball('seaLion', 0.22, at(-0.9, 0, 0.07), { ...turned, stretch: { x: 1.3 * s, y: 0.25 * s, z: 1.2 * s } }),
  ];
}

/** Old tyres hung round the side as fenders, the mark of a working pontoon. */
function tyres(radius: number): readonly Part[] {
  return Array.from({ length: TYRES.count }, (_, i) => {
    const a = (i / TYRES.count) * Math.PI * 2;
    // A flat tyre against a round wall stands furthest out at its two sides, so its middle is let into the planking.
    const out = radius - TYRES.tube * 0.4;
    return ring('fender', { radius: TYRES.radius, tube: TYRES.tube, sides: 12 }, { x: Math.cos(a) * out, y: TYRES.height, z: Math.sin(a) * out }, { turn: { x: Math.PI / 2, y: Math.PI / 2 - a, z: 0 } });
  });
}

/**
 * A round timber pontoon with sea lions hauled out on it. Its side is the sim's circle from the water to above hook
 * height. Heights are from the pier decks, with the waterline at `waterLevel`.
 */
export function seaLionFloat(radius: number, waterLevel: number): readonly Part[] {
  const foot = waterLevel - 0.8;
  return [
    post('floatSide', { radius, height: DECK - 0.1 - foot, sides: 28 }, { x: 0, y: foot, z: 0 }),
    post('floatDeck', { radius: radius * 0.985, height: 0.1, sides: 28 }, { x: 0, y: DECK - 0.1, z: 0 }),
    ...tyres(radius),
    ...LOUNGERS.flatMap(seaLion),
  ];
}
