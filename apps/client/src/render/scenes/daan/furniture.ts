import { seeded } from '../kit/canvas';
import { ball, block, post, type Part } from '../kit/parts';

const BENCH = { length: 1.9, seat: 0.48, depth: 0.5, back: 0.95 };
const LAMP_HEIGHT = 3.3;

/** A park bench facing south, its back to the trees. `z` is its back edge. */
export function bench(x: number, z: number): readonly Part[] {
  const half = BENCH.length / 2;
  return [
    block('benchWood', [x - half, x + half], [BENCH.seat - 0.07, BENCH.seat], [z, z + BENCH.depth]),
    block('benchWood', [x - half, x + half], [BENCH.seat + 0.18, BENCH.back], [z, z + 0.07]),
    ...[x - half + 0.15, x + half - 0.15].map((lx) => block('iron', [lx - 0.04, lx + 0.04], [0, BENCH.back], [z, z + BENCH.depth])),
  ];
}

/** A park lamp: a dark post with a pale globe. Unlit by day. */
export function parkLamp(x: number, z: number): readonly Part[] {
  return [
    post('iron', { radius: 0.11, height: 0.5, sides: 8 }, { x, y: 0, z }),
    post('iron', { radius: 0.06, height: LAMP_HEIGHT, sides: 6 }, { x, y: 0, z }),
    ball('lampGlobe', 0.24, { x, y: LAMP_HEIGHT + 0.2, z }),
  ];
}

/** A bank of azaleas in flower along x, clipped low. */
export function azaleas(x: readonly [number, number], z: number, seed: number): readonly Part[] {
  const random = seeded(seed);
  const parts: Part[] = [];
  for (let at = x[0]; at < x[1]; at += 0.75 + random() * 0.25) {
    const r = 0.5 + random() * 0.2;
    parts.push(ball('azalea', r, { x: at, y: r * 0.55, z: z + (random() - 0.5) * 0.5 }, { stretch: { x: 1.1, y: 0.75, z: 1 }, slide: { u: random(), v: random() } }));
  }
  return parts;
}

export type PavilionSpec = { readonly x: number; readonly z: number; readonly radius: number };

const PAVILION = { base: 0.3, column: 1.9, roof: 1.25, sides: 6 };

/** A six-sided garden pavilion: stone base, red columns, a glazed tile roof with upturned eaves suggested by a second, flatter tier. */
export function pavilion(spec: PavilionSpec): readonly Part[] {
  const eave = PAVILION.base + PAVILION.column;
  const columns = Array.from({ length: PAVILION.sides }, (_, i) => {
    const a = (i / PAVILION.sides) * Math.PI * 2 + Math.PI / 6;
    const out = spec.radius * 0.78;
    return post('column', { radius: 0.13, height: PAVILION.column, sides: 8 }, { x: spec.x + Math.cos(a) * out, y: PAVILION.base, z: spec.z + Math.sin(a) * out });
  });
  return [
    post('kerb', { radius: spec.radius, height: PAVILION.base, sides: PAVILION.sides }, { x: spec.x, y: 0, z: spec.z }),
    ...columns,
    post('roofRidge', { radius: spec.radius * 1.12, height: 0.12, sides: PAVILION.sides }, { x: spec.x, y: eave, z: spec.z }),
    post('roofTile', { radius: spec.radius * 1.18, topRadius: spec.radius * 0.5, height: PAVILION.roof * 0.4, sides: PAVILION.sides }, { x: spec.x, y: eave + 0.1, z: spec.z }),
    post('roofTile', { radius: spec.radius * 0.5, topRadius: 0.1, height: PAVILION.roof * 0.6, sides: PAVILION.sides }, { x: spec.x, y: eave + 0.1 + PAVILION.roof * 0.4, z: spec.z }),
    ball('roofRidge', 0.16, { x: spec.x, y: eave + 0.2 + PAVILION.roof, z: spec.z }),
  ];
}
