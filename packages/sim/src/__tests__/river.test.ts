import { describe, expect, it } from 'vitest';
import { DEFAULT_ARENA, PICKUPS, spawnPickup, TICK_DT } from '../index';
import type { GameState } from '../index';
import { at, match, run, riverMatch } from './helpers';

const DUEL = [['w', 'west'], ['e', 'east']] as const;
const ticksFor = (seconds: number): number => Math.round(seconds / TICK_DT);

/** Every pickup the water sends in `seconds`, as (time it appeared, end, kind, lane). */
function arrivals(state: GameState, seconds: number) {
  const seen = new Map<string, { readonly at: number; readonly from: string; readonly kind: string; readonly lane: number }>();
  let s = state;
  for (let i = 0; i < ticksFor(seconds); i++) {
    s = run(s, 1).state;
    s.pickups.forEach((p) => {
      if (!seen.has(p.id)) seen.set(p.id, { at: s.time, from: p.from, kind: p.kind, lane: p.lane });
    });
  }
  return [...seen.values()];
}

describe('the river', () => {
  it('sends nothing when pickups are off, which is the default', () => {
    const s = match(DUEL);
    expect(s.river).toBeNull();
    expect(run(s, ticksFor(PICKUPS.firstAt + 2 * PICKUPS.interval)).state.pickups).toEqual([]);
  });

  it('sends the first pickup after the opening delay, then one every interval', () => {
    const got = arrivals(riverMatch(DUEL), PICKUPS.firstAt + 2 * PICKUPS.interval + 1);
    expect(got.map((g) => g.at)).toEqual([
      expect.closeTo(PICKUPS.firstAt + TICK_DT, 6),
      expect.closeTo(PICKUPS.firstAt + PICKUPS.interval + TICK_DT, 6),
      expect.closeTo(PICKUPS.firstAt + 2 * PICKUPS.interval + TICK_DT, 6),
    ]);
  });

  it('rolls the same ends, kinds and lanes for the same seed, and different ones for another', () => {
    const seconds = PICKUPS.firstAt + 5 * PICKUPS.interval;
    const a = arrivals(riverMatch(DUEL, 7), seconds);
    expect(arrivals(riverMatch(DUEL, 7), seconds)).toEqual(a);
    expect(arrivals(riverMatch(DUEL, 8), seconds)).not.toEqual(a);
  });

  it('keeps every lane on the water, clear of both banks', () => {
    const lanes = [1, 2, 3, 4, 5, 6, 7, 8].flatMap((seed) => arrivals(riverMatch(DUEL, seed), PICKUPS.firstAt + 3 * PICKUPS.interval).map((g) => g.lane));
    lanes.forEach((x) => {
      expect(x).toBeGreaterThanOrEqual(DEFAULT_ARENA.canal.x0 + PICKUPS.radius);
      expect(x).toBeLessThanOrEqual(DEFAULT_ARENA.canal.x1 - PICKUPS.radius);
    });
  });

  it('drifts at the configured speed from the end it entered toward the other', () => {
    const s = spawnPickup(match(DUEL), { kind: 'gold', from: 'north', lane: 1100 });
    expect(s.pickups[0]?.pos).toEqual(at(1100, -PICKUPS.radius));
    const later = run(s, ticksFor(4)).state.pickups[0];
    expect(later?.pos.y).toBeCloseTo(-PICKUPS.radius + 4 * PICKUPS.driftSpeed, 6);
    const up = run(spawnPickup(match(DUEL), { kind: 'gold', from: 'south', lane: 1100 }), ticksFor(4)).state.pickups[0];
    expect(up?.pos.y).toBeCloseTo(DEFAULT_ARENA.height + PICKUPS.radius - 4 * PICKUPS.driftSpeed, 6);
  });

  it('is gone once it floats past the far end', () => {
    const s = spawnPickup(match(DUEL), { kind: 'storm', from: 'south', lane: 1300 });
    const crossing = (DEFAULT_ARENA.height + 2 * PICKUPS.radius) / PICKUPS.driftSpeed;
    expect(run(s, ticksFor(crossing) - 2).state.pickups).toHaveLength(1);
    expect(run(s, ticksFor(crossing) + 2).state.pickups).toEqual([]);
  });

  it('carries a pickup around the buoy rather than through it', () => {
    const { buoy } = DEFAULT_ARENA;
    const s = spawnPickup(match(DUEL), { kind: 'gale', from: 'north', lane: buoy.pos.x - 10 });
    let state = s;
    for (let i = 0; i < ticksFor(40) && state.pickups.length > 0; i++) {
      state = run(state, 1).state;
      const p = state.pickups[0];
      if (p) expect(Math.hypot(p.pos.x - buoy.pos.x, p.pos.y - buoy.pos.y)).toBeGreaterThan(buoy.radius + PICKUPS.radius);
    }
  });
});
