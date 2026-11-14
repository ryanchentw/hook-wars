import { DEFAULT_ARENA } from '@hookbrawl/sim';
import { describe, expect, it } from 'vitest';
import { toWorldLength } from '../../space';
import { layOutArena, propFootprint } from './layout';

const arena = DEFAULT_ARENA;
const layout = layOutArena(arena);
const w = toWorldLength(arena.width);
const d = toWorldLength(arena.height);
const canal = { from: toWorldLength(arena.canal.x0), to: toWorldLength(arena.canal.x1) };

const footprint = propFootprint;

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
    expect(layout.lamps.length).toBeGreaterThanOrEqual(4);
    expect(layout.lamps.length).toBeLessThanOrEqual(8);
    layout.lamps.forEach((t) => {
      expect(t.glowAt.z < 0 || t.glowAt.z > d).toBe(true);
      expect(t.glowAt.y).toBeGreaterThan(0);
    });
  });

});
