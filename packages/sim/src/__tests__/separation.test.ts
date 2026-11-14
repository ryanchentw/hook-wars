import { describe, expect, it } from 'vitest';
import { DEFAULT_ARENA, step, TICK_DT, TUNING } from '../index';
import type { GameState, Vec2 } from '../index';
import { at, match, pid, player, run, runUntil, withPlayer } from './helpers';

const BODY = TUNING.playerRadius * 2;
const gap = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

function pair(w: Vec2, e: Vec2): GameState {
  const s = match([
    ['w', 'west'],
    ['e', 'east'],
  ]);
  return withPlayer(withPlayer(s, 'w', { pos: w }), 'e', { pos: e });
}

describe('body separation', () => {
  it('two players on the same spot end up a body apart', () => {
    const after = step(pair(at(500, 500), at(500, 500)), [], TICK_DT);
    expect(gap(player(after, 'w').pos, player(after, 'e').pos)).toBeCloseTo(BODY, 6);
  });

  it('overlapping players are pushed apart evenly along the line between them', () => {
    const after = step(pair(at(500, 500), at(520, 500)), [], TICK_DT);
    expect(player(after, 'w').pos).toEqual(at(476, 500));
    expect(player(after, 'e').pos).toEqual(at(544, 500));
  });

  it('players already a body apart are left alone', () => {
    const after = step(pair(at(500, 500), at(500 + BODY, 500)), [], TICK_DT);
    expect(player(after, 'w').pos).toEqual(at(500, 500));
    expect(player(after, 'e').pos).toEqual(at(500 + BODY, 500));
  });

  it('never pushes a player off the dock into the canal', () => {
    const edge = DEFAULT_ARENA.canal.x0 - TUNING.playerRadius;
    const { state } = run(pair(at(edge - 20, 500), at(edge, 500)), 30);
    expect(player(state, 'e').pos.x).toBeLessThanOrEqual(edge);
    expect(gap(player(state, 'w').pos, player(state, 'e').pos)).toBeGreaterThan(BODY - 1);
  });

  it('a corpse does not shove the living', () => {
    const s = withPlayer(pair(at(500, 500), at(500, 500)), 'e', {
      status: { kind: 'dead', respawnAt: 99 },
    });
    expect(player(step(s, [], TICK_DT), 'w').pos).toEqual(at(500, 500));
  });

  it('a dragged enemy is dropped beside the thrower, not on top of them', () => {
    const s = pair(at(800, 500), at(1600, 500));
    const thrown = step(s, [{ kind: 'hook', playerId: pid('w'), target: at(1600, 500) }], TICK_DT);
    const { state } = runUntil(thrown, (g) => g.hooks.length === 0, 300);
    const settled = step(state, [], TICK_DT);
    expect(player(settled, 'e').status.kind).toBe('alive');
    expect(gap(player(settled, 'w').pos, player(settled, 'e').pos)).toBeGreaterThanOrEqual(BODY - 1e-6);
  });
});
