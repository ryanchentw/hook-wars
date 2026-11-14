import { DEFAULT_ARENA } from '@hookbrawl/sim';
import { describe, expect, it } from 'vitest';
import type { PropName } from '../assets/manifest';
import { toWorldLength } from '../space';
import { layOutArena, type Placement } from './layout';

/** Half extents and height of each model as shipped, read from the files' own bounds. */
const BOUNDS: Readonly<Record<PropName, { readonly halfX: number; readonly halfZ: number; readonly height: number }>> = {
  floorStone: { halfX: 2, halfZ: 2, height: 0.05 },
  floorTimber: { halfX: 2, halfZ: 2, height: 0.05 },
  wall: { halfX: 2, halfZ: 0.5, height: 4 },
  wallPillar: { halfX: 2, halfZ: 0.75, height: 4 },
  wallGated: { halfX: 2, halfZ: 0.5, height: 4 },
  parapet: { halfX: 2, halfZ: 0.25, height: 1.1 },
  pillar: { halfX: 0.75, halfZ: 0.75, height: 4 },
  torchMounted: { halfX: 0.28, halfZ: 0.62, height: 0.68 },
  torchStanding: { halfX: 0.28, halfZ: 0.28, height: 0.73 },
  barrel: { halfX: 0.9, halfZ: 0.9, height: 2 },
  barrelStack: { halfX: 0.93, halfZ: 0.93, height: 1.77 },
  crates: { halfX: 1.16, halfZ: 1.16, height: 2.14 },
  boxes: { halfX: 1.86, halfZ: 1.86, height: 3.31 },
  keg: { halfX: 1.02, halfZ: 1.02, height: 2.05 },
};

const arena = DEFAULT_ARENA;
const layout = layOutArena(arena);
const w = toWorldLength(arena.width);
const d = toWorldLength(arena.height);
const canal = { from: toWorldLength(arena.canal.x0), to: toWorldLength(arena.canal.x1) };

type Footprint = { readonly x0: number; readonly x1: number; readonly z0: number; readonly z1: number; readonly top: number };

function footprint(prop: PropName, p: Placement): Footprint {
  const b = BOUNDS[prop];
  const turned = Math.abs(Math.sin(p.yaw));
  // A prop turned to any odd angle is boxed by its larger half extent, which only overestimates.
  const square = turned > 1e-6 && turned < 1 - 1e-6;
  const hx = square ? Math.max(b.halfX, b.halfZ) * Math.SQRT2 : (turned > 0.5 ? b.halfZ : b.halfX) * (turned > 0.5 ? p.scale.z : p.scale.x);
  const hz = square ? hx : (turned > 0.5 ? b.halfX : b.halfZ) * (turned > 0.5 ? p.scale.x : p.scale.z);
  return { x0: p.x - hx, x1: p.x + hx, z0: p.z - hz, z1: p.z + hz, top: p.y + b.height * p.scale.y };
}

const EPS = 1e-6;

describe('arena layout', () => {
  it('floors each dock exactly, with timber along the canal and stone behind it', () => {
    const floors = layout.groups.filter((g) => g.surface === 'stone' || g.surface === 'timber');
    const prints = floors.flatMap((g) => g.placements.map((p) => footprint(g.prop, p)));
    const area = prints.reduce((sum, f) => sum + (f.x1 - f.x0) * (f.z1 - f.z0), 0);
    expect(area).toBeCloseTo((w - (canal.to - canal.from)) * d, 4);
    prints.forEach((f) => {
      expect(f.top).toBeCloseTo(0);
      expect(f.z0).toBeGreaterThanOrEqual(-EPS);
      expect(f.z1).toBeLessThanOrEqual(d + EPS);
      expect(f.x1 <= canal.from + EPS || f.x0 >= canal.to - EPS).toBe(true);
    });
    const timber = layout.groups.filter((g) => g.surface === 'timber').flatMap((g) => g.placements.map((p) => footprint(g.prop, p)));
    expect(Math.max(...timber.filter((f) => f.x1 <= canal.from + EPS).map((f) => f.x1))).toBeCloseTo(canal.from);
    expect(Math.min(...timber.filter((f) => f.x0 >= canal.to - EPS).map((f) => f.x0))).toBeCloseTo(canal.to);
  });

  it('keeps everything that stands above the walking surface outside the playable rectangle', () => {
    const offenders = layout.groups
      .filter((g) => g.surface !== 'stone' && g.surface !== 'timber')
      .flatMap((g) => g.placements.map((p) => ({ prop: g.prop, f: footprint(g.prop, p) })))
      .filter(({ f }) => f.top > EPS)
      .filter(({ f }) => f.x1 > EPS && f.x0 < w - EPS && f.z1 > EPS && f.z0 < d - EPS);
    expect(offenders).toEqual([]);
  });

  it('keeps the solid ledges outside the playable rectangle too', () => {
    layout.ledges.forEach((b) => {
      const outside = b.max.x <= 0 || b.min.x >= w || b.max.z <= 0 || b.min.z >= d;
      expect(outside).toBe(true);
    });
  });

  it('sets the edging stones flush with the walking surface, inside the docks', () => {
    expect(layout.copings.length).toBeGreaterThan(0);
    layout.copings.forEach((b) => {
      expect(b.max.y).toBeLessThanOrEqual(0.02);
      expect(b.min.x).toBeGreaterThanOrEqual(-EPS);
      expect(b.max.x).toBeLessThanOrEqual(w + EPS);
      expect(b.max.z).toBeLessThanOrEqual(d + EPS);
      expect(b.max.x <= canal.from + EPS || b.min.x >= canal.to - EPS).toBe(true);
    });
  });

  it('lights a handful of torches, all off the docks', () => {
    expect(layout.torches.length).toBeGreaterThanOrEqual(4);
    expect(layout.torches.length).toBeLessThanOrEqual(8);
    layout.torches.forEach((t) => {
      expect(t.flame.z < 0 || t.flame.z > d).toBe(true);
      expect(t.flame.y).toBeGreaterThan(0);
    });
  });

  it('puts the water below the walking surface', () => {
    expect(layout.water.level).toBeLessThan(-1);
  });
});
