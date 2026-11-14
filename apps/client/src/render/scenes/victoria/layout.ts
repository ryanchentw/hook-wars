import type { Arena } from '@hookbrawl/sim';
import { dockExtents, docks, fenceAlongX, type DockSpec } from '../kit/docks';
import { block, box, post, ring, sheet, type Part } from '../kit/parts';
import { planOf, type Plan, type Span } from '../kit/plan';
import { proceduralLayout, type ProceduralLayout } from '../kit/proceduralSet';
import type { Lamp } from '../types';
import { BUOY_LAMP_HEIGHT, BUOY_MOTION, channelBuoy, ferry, FERRY_MOTION, junk, JUNK_MOTION } from './boats';
import { BUOY_LAMP, NEON_CYAN, NEON_PINK, PROMENADE_LAMP, VICTORIA_SIZES as S } from './look';
import { skyline } from './skyline';

const DOCKS: DockSpec = {
  ground: { west: 'promenade', east: 'pier' },
  apron: 'apron',
  body: 'quay',
  coping: 'coping',
  north: S.apron,
  side: S.side,
  south: 3,
  depth: S.quayDepth,
  copingWidth: 0.7,
};
const RAIL = { height: S.railHeight, spacing: 2, rails: 2, thickness: 0.05 };
/** Open water for the establishing shot to look across, out past where the fog has closed. */
const HARBOUR = { west: -140, east: 220, north: -70, south: 110 };
/** The water the gameplay camera can see north of the docks, which gets reflections drawn finely enough to be looked down on. */
const NEAR_WATER = { west: -24, east: 100, north: -24 };
const SIGN = { board: { width: 3.4, height: 2.1, foot: 1.5 }, blade: { width: 0.95, height: 3.3, foot: 0.7 }, depth: 0.22 };
const LAMP_POST = 3.6;
const LIFEBUOY = { radius: 0.36, tube: 0.1 };
/** Stands a ring on its edge, facing south. */
const UPRIGHT = { x: Math.PI / 2, y: 0, z: 0 };

/** Where the dressing stands along the north apron of a dock, measured inward from its outer end. */
type Row = { readonly sign: number; readonly blade: number; readonly lamp: number; readonly bollards: readonly number[]; readonly lifebuoys: readonly number[] };
const ROW: Row = { sign: 3.4, blade: 0.4, lamp: 9.5, bollards: [12.5, 18.5, 24.5], lifebuoys: [8, 16, 23] };

function signBoard(paint: string, x: Span, z: number, foot: number, height: number): readonly Part[] {
  const centre = (x.from + x.to) / 2;
  return [
    block('signBack', [x.from - 0.08, x.to + 0.08], [foot - 0.08, foot + height + 0.08], [z - SIGN.depth, z - 0.02]),
    block(paint, [x.from, x.to], [foot, foot + height], [z - 0.02, z]),
    ...[x.from + 0.2, x.to - 0.2].map((px) => post('iron', { radius: 0.07, height: foot, sides: 6 }, { x: px, y: 0, z: z - SIGN.depth / 2 })),
    post('iron', { radius: 0.05, height: 0.05, sides: 6 }, { x: centre, y: 0, z: z - SIGN.depth / 2 }),
  ];
}

function lampPost(x: number, z: number): readonly Part[] {
  return [
    post('iron', { radius: 0.08, topRadius: 0.05, height: LAMP_POST, sides: 6 }, { x, y: 0, z }),
    box('iron', { x: 0.1, y: 0.08, z: 0.9 }, { x, y: LAMP_POST, z: z + 0.4 }),
    box('lampHead', { x: 0.34, y: 0.1, z: 0.5 }, { x, y: LAMP_POST - 0.08, z: z + 0.7 }),
  ];
}

function bollard(x: number, z: number): readonly Part[] {
  return [
    post('iron', { radius: 0.26, height: 0.62, sides: 10 }, { x, y: 0, z }),
    post('iron', { radius: 0.38, height: 0.14, sides: 10 }, { x, y: 0.62, z }),
  ];
}

/** One dock's north apron: railing with lifebuoys on it, bollards, a lamp, and two neon signs at its outer end. */
function apronRow(dock: Span, outerAt: 'from' | 'to'): { readonly parts: readonly Part[]; readonly lamps: readonly Lamp[] } {
  const inward = outerAt === 'from' ? 1 : -1;
  const at = (offset: number): number => dock[outerAt] + inward * offset;
  const span = (offset: number, width: number): Span => {
    const a = at(offset);
    const b = at(offset + width);
    return { from: Math.min(a, b), to: Math.max(a, b) };
  };
  const railZ = -S.apron + 0.1;
  const signZ = -S.apron + 0.5;
  const board = span(ROW.sign, SIGN.board.width);
  const blade = span(ROW.blade, SIGN.blade.width);
  // The west dock is washed pink and the east cyan, so the two ends of the picture never read as one.
  const neon = inward > 0 ? NEON_PINK : NEON_CYAN;
  const signLamp = { ...neon, glowAt: { x: (board.from + board.to) / 2, y: SIGN.board.foot + 1, z: signZ + 0.5 } };
  const lampX = at(ROW.lamp);
  const railed = { from: dock.from - (outerAt === 'from' ? S.side : 0), to: dock.to + (outerAt === 'to' ? S.side : 0) };
  return {
    parts: [
      ...fenceAlongX('rail', railed, railZ, RAIL),
      ...ROW.lifebuoys.map((o) => ring('lifebuoy', LIFEBUOY, { x: at(o), y: 0.62, z: railZ + 0.12 }, { turn: UPRIGHT })),
      ...ROW.bollards.flatMap((o) => bollard(at(o), -S.apron / 2)),
      ...signBoard('signPink', board, signZ, SIGN.board.foot, SIGN.board.height),
      ...signBoard('signCyan', blade, signZ, SIGN.blade.foot, SIGN.blade.height),
      ...lampPost(lampX, -S.apron + 0.3),
    ],
    lamps: [signLamp, { ...PROMENADE_LAMP, glowAt: { x: lampX, y: LAMP_POST - 0.1, z: -S.apron + 1 } }],
  };
}

/** Light lying on the water: across the open harbour to the far shore, and down the strip between the docks. */
function sheen(plan: Plan): readonly Part[] {
  const y = S.waterLevel + 0.03;
  return [
    sheet('sheenFar', [HARBOUR.west, HARBOUR.east], [HARBOUR.north + 8, NEAR_WATER.north], y),
    sheet('sheenNear', [NEAR_WATER.west, NEAR_WATER.east], [NEAR_WATER.north, -S.apron], y),
    sheet('sheenStrip', [plan.strip.from, plan.strip.to], [-S.apron, plan.d + 14], y),
  ];
}

/** Victoria Harbour after dark: a granite promenade and a ferry pier, a junk and a ferry off their ends, the lit shore across the water. */
export function layOutVictoria(arena: Arena): ProceduralLayout {
  const plan = planOf(arena);
  const extents = dockExtents(plan, DOCKS);
  const west = apronRow(plan.docks.west, 'from');
  const east = apronRow(plan.docks.east, 'to');
  const buoyLamp: Lamp = { ...BUOY_LAMP, glowAt: { x: plan.obstacle.x, y: BUOY_LAMP_HEIGHT, z: plan.obstacle.z } };
  return proceduralLayout({
    plan,
    still: [...docks(plan, DOCKS), ...west.parts, ...east.parts, ...sheen(plan), ...skyline()],
    obstacle: { parts: channelBuoy(plan.obstacle.radius, S.waterLevel), motion: BUOY_MOTION },
    movers: [
      { parts: junk(), home: { x: 14.5, y: S.waterLevel, z: extents.west.z.from - 2.7 }, motion: JUNK_MOTION },
      { parts: ferry(), home: { x: 60.5, y: S.waterLevel, z: extents.east.z.from - 3.2 }, motion: FERRY_MOTION },
    ],
    lamps: [...west.lamps, ...east.lamps, buoyLamp],
    water: {
      centre: { x: (HARBOUR.west + HARBOUR.east) / 2, y: S.waterLevel, z: (HARBOUR.north + HARBOUR.south) / 2 },
      width: HARBOUR.east - HARBOUR.west,
      depth: HARBOUR.south - HARBOUR.north,
    },
  });
}
