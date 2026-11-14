import type { Arena } from '@hookbrawl/sim';
import type { PropName } from '../assets/manifest';
import { toWorldLength, type Vec3 } from '../space';
import { SIZES } from '../theme';

export type Placement = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Radians about +y. */
  readonly yaw: number;
  readonly scale: Vec3;
};

export type Surface = 'stone' | 'timber' | 'wall' | 'prop';

export type PropGroup = {
  readonly prop: PropName;
  readonly surface: Surface;
  readonly placements: readonly Placement[];
  readonly castShadow: boolean;
};

export type Box = { readonly min: Vec3; readonly max: Vec3 };

export type TorchSpot = { readonly flame: Vec3 };

export type ArenaLayout = {
  readonly groups: readonly PropGroup[];
  /** Solid masonry under and behind the tiles: the raised ledges that ring the quays. */
  readonly ledges: readonly Box[];
  /** Pale edging stones set flush into the dock along every drop, so the edge of the walkable ground reads at a glance. */
  readonly copings: readonly Box[];
  readonly torches: readonly TorchSpot[];
  /** One sheet under the canal and out past the harbour mouth; the walls hide where it stops. */
  readonly water: { readonly level: number; readonly centre: Vec3; readonly width: number; readonly depth: number };
};

type Span = { readonly from: number; readonly to: number };

const ONE: Vec3 = { x: 1, y: 1, z: 1 };
const QUARTER = Math.PI / 2;
const TILE = SIZES.tile;
const WALL_THICKNESS = 1;
const PARAPET = { height: 1.1, thickness: 0.5 };
const PILLAR = { height: 4, half: 0.75 };
// Sinks wall tops a hair under the tiles so the two never fight for the same pixels.
const UNDER_TILE = 0.02;
const TIMBER_COLUMNS = 2;
/** The tile model's walking face sits this far above its origin. */
const TILE_TOP = 0.05;
/** How far the water runs south of the docks before the fog has swallowed it. */
const OPEN_WATER = 90;
const COPING = { width: 0.7, depth: 0.4, proud: 0.012 };

const at = (x: number, y: number, z: number, yaw = 0, scale: Vec3 = ONE): Placement => ({ x, y, z, yaw, scale });

/** Splits a span into whole pieces of roughly `piece` length, stretched slightly to fit it exactly. */
function pieces(span: Span, piece: number): { readonly centres: readonly number[]; readonly stretch: number } {
  const length = span.to - span.from;
  const count = Math.max(1, Math.round(length / piece));
  const step = length / count;
  return { centres: Array.from({ length: count }, (_, i) => span.from + (i + 0.5) * step), stretch: step / piece };
}

function wallRun(along: Span, fixed: number, y: number, axis: 'x' | 'z', heightScale = 1): readonly Placement[] {
  const { centres, stretch } = pieces(along, TILE);
  const scale = { x: stretch, y: heightScale, z: 1 };
  return centres.map((c) => (axis === 'x' ? at(c, y, fixed, 0, scale) : at(fixed, y, c, QUARTER, scale)));
}

function tiles(xs: Span, zs: Span, y: number): readonly Placement[] {
  const cols = pieces(xs, TILE);
  const rows = pieces(zs, TILE);
  const scale = { x: cols.stretch, y: 1, z: rows.stretch };
  return cols.centres.flatMap((x) => rows.centres.map((z) => at(x, y - TILE_TOP, z, 0, scale)));
}

/** Everything static in the harbour, derived from the sim's arena so docks and canal sit exactly where the rules say. */
export function layOutArena(arena: Arena): ArenaLayout {
  const w = toWorldLength(arena.width);
  const d = toWorldLength(arena.height);
  const canal = { from: toWorldLength(arena.canal.x0), to: toWorldLength(arena.canal.x1) };
  const ledge = SIZES.ledgeDepth;
  const top = SIZES.ledgeHeight;
  const depth: Span = { from: 0, to: d };
  const docks: readonly Span[] = [{ from: 0, to: canal.from }, { from: canal.to, to: w }];
  const timber: readonly Span[] = [
    { from: canal.from - TIMBER_COLUMNS * TILE, to: canal.from },
    { from: canal.to, to: canal.to + TIMBER_COLUMNS * TILE },
  ];
  const stone: readonly Span[] = [{ from: 0, to: timber[0]!.from }, { from: timber[1]!.to, to: w }];
  const quayY = -SIZES.wallHeight - UNDER_TILE;
  const parapetScale = { x: 1, y: top / PARAPET.height, z: 1 };
  const withParapetHeight = (ps: readonly Placement[]): readonly Placement[] =>
    ps.map((p) => ({ ...p, scale: { ...p.scale, y: parapetScale.y } }));

  const northLedges: readonly Span[] = [{ from: -ledge, to: canal.from }, { from: canal.to, to: w + ledge }];
  const sideDepth: Span = { from: -ledge, to: d };
  const gateY = SIZES.waterLevel - 0.4;
  const gateFill = (top + SIZES.wallHeight - (gateY + SIZES.wallHeight)) / SIZES.wallHeight;
  const backZ = -ledge - WALL_THICKNESS / 2;

  const torchXs = [2, canal.from - 2, canal.to + 2, w - 2];
  const northPillars = torchXs.map((x) => at(x, top, -ledge + PILLAR.half));
  const northTorches = torchXs.map((x) => at(x, top + 2.7, -ledge + 2 * PILLAR.half));
  const mouthXs = [canal.from - PILLAR.half, canal.to + PILLAR.half];
  const mouthZ = d + 1.6;
  const mouthTop = 1.2;
  const mouthPillars = mouthXs.map((x) => at(x, mouthTop - PILLAR.height, mouthZ));
  const mouthTorches = mouthXs.map((x) => at(x, mouthTop + 0.4, mouthZ));

  const groups: readonly PropGroup[] = [
    { prop: 'floorStone', surface: 'stone', castShadow: false, placements: stone.flatMap((s) => tiles(s, depth, 0)) },
    { prop: 'floorTimber', surface: 'timber', castShadow: false, placements: timber.flatMap((s) => tiles(s, depth, 0)) },
    {
      prop: 'floorStone',
      surface: 'wall',
      castShadow: false,
      placements: [
        ...northLedges.flatMap((s) => tiles(s, { from: -ledge, to: 0 }, top)),
        ...tiles({ from: -ledge, to: 0 }, depth, top),
        ...tiles({ from: w, to: w + ledge }, depth, top),
      ],
    },
    {
      prop: 'wall',
      surface: 'wall',
      castShadow: true,
      placements: [
        ...wallRun(depth, canal.from - WALL_THICKNESS / 2, quayY, 'z'),
        ...wallRun(depth, canal.to + WALL_THICKNESS / 2, quayY, 'z'),
        ...docks.flatMap((s) => wallRun(s, d - WALL_THICKNESS / 2, quayY, 'x')),
        ...northLedges.flatMap((s) => wallRun(s, backZ, top, 'x')),
        ...wallRun(canal, backZ, gateY + SIZES.wallHeight, 'x', gateFill),
      ],
    },
    {
      prop: 'wallPillar',
      surface: 'wall',
      castShadow: true,
      placements: [
        ...wallRun(sideDepth, -ledge - WALL_THICKNESS / 2, top, 'z'),
        ...wallRun(sideDepth, w + ledge + WALL_THICKNESS / 2, top, 'z'),
      ],
    },
    { prop: 'wallGated', surface: 'wall', castShadow: true, placements: wallRun(canal, backZ, gateY, 'x') },
    {
      prop: 'parapet',
      surface: 'wall',
      castShadow: true,
      placements: withParapetHeight([
        ...docks.flatMap((s) => wallRun(s, -PARAPET.thickness / 2, 0, 'x')),
        ...wallRun(depth, -PARAPET.thickness / 2, 0, 'z'),
        ...wallRun(depth, w + PARAPET.thickness / 2, 0, 'z'),
      ]),
    },
    { prop: 'pillar', surface: 'wall', castShadow: true, placements: [...northPillars, ...mouthPillars] },
    { prop: 'torchMounted', surface: 'prop', castShadow: false, placements: northTorches },
    { prop: 'torchStanding', surface: 'prop', castShadow: false, placements: mouthTorches },
    ...decor(w, canal, ledge, top),
  ];

  return {
    groups,
    ledges: [
      ...northLedges.map((s) => box(s, { from: -ledge, to: 0 }, top)),
      box({ from: -ledge, to: 0 }, depth, top),
      box({ from: w, to: w + ledge }, depth, top),
    ],
    copings: [
      coping({ from: canal.from - COPING.width, to: canal.from }, depth),
      coping({ from: canal.to, to: canal.to + COPING.width }, depth),
      ...docks.map((s) => coping(s, { from: d - COPING.width, to: d })),
    ],
    torches: [
      ...northTorches.map((p) => ({ flame: { x: p.x, y: p.y + 0.75, z: p.z + 0.45 } })),
      ...mouthTorches.map((p) => ({ flame: { x: p.x, y: p.y + 0.75, z: p.z } })),
    ],
    water: {
      level: SIZES.waterLevel,
      centre: { x: w / 2, y: SIZES.waterLevel, z: (d + OPEN_WATER - ledge) / 2 },
      width: w + 2 * ledge,
      depth: d + OPEN_WATER + ledge,
    },
  };
}

function coping(xs: Span, zs: Span): Box {
  return { min: { x: xs.from, y: -COPING.depth, z: zs.from }, max: { x: xs.to, y: COPING.proud, z: zs.to } };
}

function box(xs: Span, zs: Span, top: number): Box {
  // Stops a little short of the tiles and parapets that face it, for the same reason as UNDER_TILE.
  const inset = 0.05;
  return {
    min: { x: xs.from + inset, y: -SIZES.quayDepth, z: zs.from + inset },
    max: { x: xs.to - inset, y: top - 0.12, z: zs.to - inset },
  };
}

/** Cargo stacked on the ledges. Purely set dressing: every piece stands outside the playable rectangle. */
function decor(w: number, canal: Span, ledge: number, top: number): readonly PropGroup[] {
  const north = -ledge / 2;
  const west = -ledge / 2;
  const east = w + ledge / 2;
  const put = (x: number, z: number, yaw = 0): Placement => at(x, top, z, yaw);
  const group = (prop: PropName, placements: readonly Placement[]): PropGroup => ({ prop, surface: 'prop', castShadow: true, placements });
  return [
    group('crates', [put(7, north, 0.2), put(canal.to + 11, north - 0.3, 1.3), put(west, 7, 0.5), put(east, 30, 2.1)]),
    group('barrel', [
      put(11.4, north - 0.4),
      put(13.1, north + 0.5),
      put(canal.to + 21.5, north),
      put(west + 0.3, 12.5),
      put(west - 0.4, 37.5),
      put(east, 9),
      put(east - 0.5, 10.8),
    ]),
    group('keg', [put(18, north, 0.4), put(canal.to + 16.5, north, -0.5), put(west, 31, QUARTER + 0.3), put(east, 21, -QUARTER)]),
    group('boxes', [put(24, north), put(canal.to + 27.5, north, QUARTER), put(west - 0.1, 23.5, QUARTER)]),
    group('barrelStack', [put(canal.to + 5, north, 0.15), put(west, 17.5, QUARTER), put(east, 38, QUARTER)]),
  ];
}
