import { DEFAULT_ARENA } from '@hookbrawl/sim';
import { describe, expect, it } from 'vitest';
import { SIZES } from '../theme';
import { toWorldLength } from '../space';
import { SCENES } from './registry';
import { SCENE_IDS, type Footprint } from './types';

const arena = DEFAULT_ARENA;
const w = toWorldLength(arena.width);
const d = toWorldLength(arena.height);
const radius = toWorldLength(arena.buoy.radius);
/** Anything that rises less than this above the walking surface is paving, paint or a flush kerb, not an obstruction. */
const FLUSH = 0.05;
const EPS = 1e-6;
/** How much wider than the sim's circle an obstacle's trim may stand: bands, hoops and fenders, not body. */
const TRIM = 0.05;

function insidePlay(f: Footprint): boolean {
  return f.x1 > EPS && f.x0 < w - EPS && f.z1 > EPS && f.z0 < d - EPS;
}

describe('the scene registry', () => {
  it('has a scene for every id, and each knows its own id', () => {
    expect(Object.keys(SCENES).sort()).toEqual([...SCENE_IDS].sort());
    SCENE_IDS.forEach((id) => expect(SCENES[id].id).toBe(id));
  });

  it('names every place', () => {
    SCENE_IDS.forEach((id) => {
      expect(SCENES[id].title.name.length).toBeGreaterThan(3);
      expect(SCENES[id].title.caption.length).toBeGreaterThan(3);
    });
  });
});

describe.each(SCENE_IDS)('the %s scene', (id) => {
  const theme = SCENES[id];
  const layout = theme.layOut(arena);

  it('keeps everything that stands above the walking surface outside the playable rectangle', () => {
    const offenders = layout.footprints.filter((f) => f.top > FLUSH && insidePlay(f));
    expect(offenders).toEqual([]);
  });

  it('builds something', () => {
    expect(layout.footprints.length).toBeGreaterThan(10);
  });

  it('draws its obstacle on the sim\'s circle', () => {
    expect(layout.obstacle.x).toBeCloseTo(toWorldLength(arena.buoy.pos.x));
    expect(layout.obstacle.z).toBeCloseTo(toWorldLength(arena.buoy.pos.y));
    expect(layout.obstacle.radius).toBeCloseTo(radius);
    expect(layout.obstacle.reach).toBeGreaterThanOrEqual(radius - EPS);
    expect(layout.obstacle.reach).toBeLessThanOrEqual(radius * (1 + TRIM));
  });

  it('lays water under the whole strip, below the walking surface', () => {
    const { centre, width, depth } = layout.water;
    expect(theme.water.level).toBeLessThan(-0.5);
    expect(centre.x - width / 2).toBeLessThanOrEqual(toWorldLength(arena.canal.x0));
    expect(centre.x + width / 2).toBeGreaterThanOrEqual(toWorldLength(arena.canal.x1));
    expect(centre.z - depth / 2).toBeLessThanOrEqual(0);
    expect(centre.z + depth / 2).toBeGreaterThanOrEqual(d);
  });

  it('hangs its lamps clear of the fighters\' heads, or off the docks', () => {
    layout.lamps.forEach((lamp) => {
      const overPlay = lamp.glowAt.x > 0 && lamp.glowAt.x < w && lamp.glowAt.z > 0 && lamp.glowAt.z < d;
      const overStrip = lamp.glowAt.x > toWorldLength(arena.canal.x0) && lamp.glowAt.x < toWorldLength(arena.canal.x1);
      expect(!overPlay || overStrip).toBe(true);
      expect(lamp.glowAt.y + lamp.lift).toBeGreaterThan(SIZES.chainHeight);
    });
  });

  it('opens on a shot from above the ground that looks north', () => {
    for (const shot of [theme.intro.from, theme.intro.to]) {
      expect(shot.position.y).toBeGreaterThan(theme.water.level);
      expect(shot.target.z).toBeLessThan(shot.position.z);
      expect(shot.fovDeg).toBeGreaterThan(20);
      expect(shot.fovDeg).toBeLessThan(70);
    }
  });

  it('gives the two teams different signal colours', () => {
    expect(theme.tints.teams.west.signal).not.toBe(theme.tints.teams.east.signal);
  });
});
