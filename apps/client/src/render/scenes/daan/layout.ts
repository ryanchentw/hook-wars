import type { Arena } from '@hookbrawl/sim';
import { STILL } from '../kit/motion';
import { docks, type DockSpec } from '../kit/docks';
import { block, sheet, type Part } from '../kit/parts';
import { planOf, type Plan } from '../kit/plan';
import { proceduralLayout, type Mover, type ProceduralLayout } from '../kit/proceduralSet';
import { azaleas, bench, parkLamp, pavilion } from './furniture';
import { island, ISLAND_MOTION } from './island';
import { DAAN_SIZES as S } from './look';
import { cityBeyond, tallTower } from './tower';
import { banyan, boughs, type TreeSpec } from './trees';

const DOCKS: DockSpec = {
  ground: { west: 'lawnWest', east: 'lawnEast' },
  apron: 'grass',
  body: 'bank',
  coping: 'kerb',
  north: S.north,
  side: S.side,
  south: S.south,
  depth: S.bankDepth,
  copingWidth: 0.8,
};
/** The pond carries on north and south of the lawns, out to where the trees close in. */
const POND = { west: -70, east: 150, north: -75, south: 75 };
/** The walk that runs along the north of both lawns, and the row of benches, lamps and azaleas behind it. */
const WALK = { from: -3.4, to: -1.3 };
const TOWER_AT = { x: 104, z: -215 };
const SHADE_SWAY = { ...STILL, drift: 0.35, driftRate: 0.5 };

/** Trees stand clear of the playable rectangle by more than their spread, so no bough overhangs it. */
function trees(plan: Plan): readonly TreeSpec[] {
  const north = [6, 18.5, 52, 71].map((x, i) => ({ x, z: -8, clear: 3.2, spread: 4.4, seed: 300 + i }));
  const west = [5, 17, 29, 40].map((z, i) => ({ x: -6, z, clear: 4.6, spread: 5.4, seed: 320 + i }));
  const east = [8, 20, 33].map((z, i) => ({ x: plan.w + 6.2, z, clear: 4.4, spread: 5.4, seed: 340 + i }));
  // Further off than the others: seen from the north, a crown close behind the south edge would hang over it.
  const south = [4, 20, 57, 74].map((x, i) => ({ x, z: plan.d + 8.6, clear: 4.2, spread: 4.8, seed: 360 + i }));
  // The wood the park is named for, closing the view behind the north walk.
  const wood = Array.from({ length: 14 }, (_, i) => ({
    x: -34 + i * 11.5 + (i % 3) * 2.2,
    z: -19 - (i % 4) * 5.5,
    clear: 3.6 + (i % 3) * 0.7,
    spread: 5.6 + (i % 2) * 1.2,
    seed: 380 + i,
    distant: true,
  }));
  return [...north, ...west, ...east, ...south, ...wood];
}

function northRow(plan: Plan): readonly Part[] {
  const rowZ = WALK.from - 0.9;
  return [
    sheet('path', [-S.side, plan.strip.from - 0.9], [WALK.from, WALK.to], 0.006),
    sheet('path', [plan.strip.to + 0.9, plan.w + S.side], [WALK.from, WALK.to], 0.006),
    ...[10.5, 23.5, 66].flatMap((x) => bench(x, -1.05)),
    ...[2.5, 28.5, 48.3, 74.3].flatMap((x) => parkLamp(x, -0.8)),
    ...azaleas([1, 14.5], rowZ, 401),
    ...azaleas([21.5, 30], rowZ, 402),
    ...azaleas([47, 54], rowZ, 403),
    ...azaleas([66, 76], rowZ, 404),
    ...pavilion({ x: 60.2, z: -3.9, radius: 2.3 }),
    // Rockery at the two points where the pond passes the north walk.
    block('rock', [plan.strip.from - 0.9, plan.strip.from], [0, 0.5], [-S.north, -0.1]),
    block('rock', [plan.strip.to, plan.strip.to + 0.9], [0, 0.5], [-S.north, -0.1]),
  ];
}

/** On the pond: the tower's reflection down the middle of the strip, and lily pads close under either bank. */
function onThePond(plan: Plan): readonly Part[] {
  const y = S.waterLevel + 0.02;
  const mid = (plan.strip.from + plan.strip.to) / 2;
  return [
    sheet('reflection', [mid - 2.6, mid + 2.6], [0.5, 31], y),
    sheet('lilies', [plan.strip.from + 0.1, plan.strip.from + 1.5], [-S.north, plan.d + S.south], y + 0.01),
    sheet('lilies', [plan.strip.to - 1.5, plan.strip.to - 0.1], [-S.north, plan.d + S.south], y + 0.01, { slide: { u: 0.4, v: 0.3 } }),
  ];
}

/** Boughs out of the picture, over the outer third of each lawn and its north edge, swaying a little. */
function shade(plan: Plan): readonly Mover[] {
  const hang = (x: readonly [number, number], z: readonly [number, number], seed: number): Mover => ({
    parts: boughs({ x, z, height: [15, 19], count: 90, seed }),
    home: { x: 0, y: 0, z: 0 },
    motion: SHADE_SWAY,
  });
  return [hang([-13, -4], [10, 54], 501), hang([plan.w - 22, plan.w - 13], [12, 56], 502), hang([-8, 4], [9, 15], 503)];
}

/** Daan Forest Park on a clear afternoon: two lawns with brick paths either side of the pond, its island of egrets between them. */
export function layOutDaan(arena: Arena): ProceduralLayout {
  const plan = planOf(arena);
  return proceduralLayout({
    plan,
    still: [...docks(plan, DOCKS), ...northRow(plan), ...onThePond(plan), ...trees(plan).flatMap(banyan), ...tallTower(TOWER_AT.x, TOWER_AT.z), ...cityBeyond(-150)],
    obstacle: { parts: island(plan.obstacle.radius, S.waterLevel), motion: ISLAND_MOTION },
    shade: shade(plan),
    lamps: [],
    water: {
      centre: { x: (POND.west + POND.east) / 2, y: S.waterLevel, z: (POND.north + POND.south) / 2 },
      width: POND.east - POND.west,
      depth: POND.south - POND.north,
    },
  });
}
