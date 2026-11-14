import type { Arena } from '@hookbrawl/sim';
import { docks, type DockSpec } from '../kit/docks';
import { ball, block, post, ring, type Part } from '../kit/parts';
import { planOf, type Plan, type Span } from '../kit/plan';
import { proceduralLayout, type ProceduralLayout } from '../kit/proceduralSet';
import { bridge, type BridgeSpec } from './bridge';
import { FLOAT_MOTION, seaLionFloat } from './float';
import { GATE_SIZES as S } from './look';

const DOCKS: DockSpec = {
  ground: { west: 'pierWest', east: 'pierEast' },
  apron: 'apron',
  body: 'piles',
  coping: 'edgeBeam',
  north: S.apron,
  side: S.side,
  south: 3,
  depth: S.pierDepth,
  copingWidth: 0.6,
};
/** The bay the establishing shot looks across, out past where the fog has closed. */
const BAY = { west: -160, east: 240, north: -190, south: 110 };
const PILE = { radius: 0.3, above: 0.75, spacing: 4 };

function bridgeSpec(plan: Plan): BridgeSpec {
  const mid = (plan.strip.from + plan.strip.to) / 2;
  const halfSpan = 24.4;
  return {
    z: -S.apron - 2.5,
    waterLevel: S.waterLevel,
    deckTop: -0.55,
    deckWidth: 2.3,
    towers: [mid - halfSpan, mid + halfSpan],
    towerTop: 3.55,
    anchors: [mid - halfSpan - 21, mid + halfSpan + 21],
    ends: [-70, 150],
  };
}

/** Mooring piles along the north edge of a pier, white-capped, with a coil of rope and a stack of crab pots among them. */
function pierHead(dock: Span, seedOffset: number): readonly Part[] {
  const z = -S.apron + 0.35;
  const count = Math.floor((dock.to - dock.from) / PILE.spacing);
  const piles = Array.from({ length: count + 1 }, (_, i) => {
    const x = dock.from + 0.5 + i * ((dock.to - dock.from - 1) / count);
    return [
      post('pile', { radius: PILE.radius, height: PILE.above + 1, sides: 9 }, { x, y: -1, z }),
      post('pileCap', { radius: PILE.radius * 1.02, height: 0.14, sides: 9 }, { x, y: PILE.above, z }),
    ];
  }).flat();
  const at = (offset: number): number => dock.from + ((offset + seedOffset) % (dock.to - dock.from));
  return [
    ...piles,
    ring('rope', { radius: 0.42, tube: 0.1, sides: 14 }, { x: at(6.2), y: 0.1, z: -0.6 }),
    ring('rope', { radius: 0.3, tube: 0.1, sides: 14 }, { x: at(6.2), y: 0.28, z: -0.6 }),
    block('crate', [at(13.6) - 0.5, at(13.6) + 0.5], [0, 0.55], [-1, -0.25]),
    block('crate', [at(14.8) - 0.5, at(14.8) + 0.5], [0, 0.55], [-0.95, -0.2]),
    block('crate', [at(14.2) - 0.5, at(14.2) + 0.5], [0.55, 1.1], [-1, -0.25], { yaw: 0.2 }),
  ];
}

/** Dry hills across the water: the far shore the bridge runs to, most of it lost in fog. */
function headlands(): readonly Part[] {
  return [
    ball('headland', 70, { x: -90, y: -22, z: -175 }, { stretch: { x: 1.5, y: 0.75, z: 0.6 }, detail: 2 }),
    ball('headland', 60, { x: 40, y: -22, z: -185 }, { stretch: { x: 1.6, y: 0.6, z: 0.5 }, detail: 2 }),
    ball('headland', 75, { x: 190, y: -24, z: -170 }, { stretch: { x: 1.4, y: 0.7, z: 0.6 }, detail: 2 }),
  ];
}

/** San Francisco at golden hour: two timber piers either side of the strait, the bridge crossing just beyond them, fog on the water. */
export function layOutGoldenGate(arena: Arena): ProceduralLayout {
  const plan = planOf(arena);
  return proceduralLayout({
    plan,
    still: [...docks(plan, DOCKS), ...pierHead(plan.docks.west, 0), ...pierHead(plan.docks.east, 9), ...bridge(bridgeSpec(plan)), ...headlands()],
    obstacle: { parts: seaLionFloat(plan.obstacle.radius, S.waterLevel), motion: FLOAT_MOTION },
    lamps: [],
    water: {
      centre: { x: (BAY.west + BAY.east) / 2, y: S.waterLevel, z: (BAY.north + BAY.south) / 2 },
      width: BAY.east - BAY.west,
      depth: BAY.south - BAY.north,
    },
  });
}
