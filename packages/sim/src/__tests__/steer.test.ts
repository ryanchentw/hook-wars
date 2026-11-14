import { describe, expect, it } from 'vitest';
import { step, TICK_DT, TUNING } from '../index';
import type { GameState, HookId, PlayerInput } from '../index';
import { at, IDLE, match, pid, player, run, runUntil, steer, toward, withPlayer } from './helpers';

const r = TUNING.playerRadius;
const stride = TUNING.moveSpeed * TICK_DT;

const duel = (): GameState =>
  match([
    ['w', 'west'],
    ['e', 'east'],
  ]);

const hook = (id: string, target: { x: number; y: number }): PlayerInput[] => [
  { kind: 'hook', playerId: pid(id), target },
];

describe('steering', () => {
  it('walks moveSpeed along the held direction every tick and keeps the intent', () => {
    const s = run(duel(), 10, [steer('w', 0, -1)]).state;
    const w = player(s, 'w');
    expect(w.pos.x).toBeCloseTo(420, 9);
    expect(w.pos.y).toBeCloseTo(675 - stride * 10, 6);
    expect(w.facing).toBeCloseTo(-Math.PI / 2, 9);
    expect(w.move).toEqual({ kind: 'steer', dir: at(0, -1) });
  });

  it('normalizes the direction so a long vector is no faster', () => {
    const s = step(duel(), [steer('w', 0, -50)], TICK_DT);
    expect(player(s, 'w').move).toEqual({ kind: 'steer', dir: at(0, -1) });
    expect(player(s, 'w').pos.y).toBeCloseTo(675 - stride, 9);
  });

  it('moves diagonally at the same speed as straight', () => {
    const s = run(duel(), 10, [steer('w', 1, 1)]).state;
    const w = player(s, 'w');
    expect(Math.hypot(w.pos.x - 420, w.pos.y - 675)).toBeCloseTo(stride * 10, 6);
  });

  it('treats a zero or non-finite direction as idle', () => {
    const walking = step(duel(), [steer('w', 1, 0)], TICK_DT);
    for (const dir of [at(0, 0), at(Number.NaN, 1), at(Number.POSITIVE_INFINITY, 0), at(1, Number.NaN)]) {
      const s = step(walking, [{ kind: 'steer', playerId: pid('w'), dir }], TICK_DT);
      expect(player(s, 'w').move).toEqual(IDLE);
      expect(player(s, 'w').pos).toEqual(player(walking, 'w').pos);
    }
  });

  it('slides along a wall it pushes into', () => {
    const s0 = withPlayer(duel(), 'w', { pos: at(420, r + 1) });
    const s = run(s0, 10, [steer('w', 1, -1)]).state;
    const w = player(s, 'w');
    expect(w.pos.y).toBe(r);
    expect(w.pos.x).toBeGreaterThan(420 + stride * 10 * Math.SQRT1_2 - 1);
    expect(w.move.kind).toBe('steer');
  });

  it('stops at the canal edge of the dock it stands on', () => {
    const s0 = withPlayer(duel(), 'e', { pos: at(600, 300) });
    const s = run(s0, 60, [steer('e', 1, 0)]).state;
    expect(player(s, 'e').pos).toEqual(at(1000 - r, 300));
  });

  it('accepts steer and stop while dead or dragged, without walking until alive', () => {
    const base = withPlayer(
      withPlayer(duel(), 'w', { status: { kind: 'dead', respawnAt: 99 } }),
      'e',
      { status: { kind: 'dragged', hookId: 'h-gone' as HookId } },
    );
    const s = step(base, [steer('w', 0, 1), steer('e', 0, 1)], TICK_DT);
    expect(player(s, 'w').move).toEqual({ kind: 'steer', dir: at(0, 1) });
    expect(player(s, 'e').move).toEqual({ kind: 'steer', dir: at(0, 1) });
    expect(player(s, 'w').pos).toEqual(player(base, 'w').pos);
    const stopped = step(s, [{ kind: 'stop', playerId: pid('w') }], TICK_DT);
    expect(player(stopped, 'w').move).toEqual(IDLE);
  });
});

describe('interruptions', () => {
  // e is pinned against the canal on its own dock, so it holds still while the hook flies at it.
  const pinned = (): GameState =>
    withPlayer(withPlayer(duel(), 'w', { pos: at(600, 1100) }), 'e', { pos: at(1400 + r, 1100) });

  it('a hook latch keeps a held steer, and the dropped player walks on without new input', () => {
    const s0 = step(pinned(), [steer('e', -1, 0)], TICK_DT);
    // The thrower walks off north so it is not in the way of the dropped player's walk west.
    const thrown = step(s0, [...hook('w', at(1400 + r, 1100)), steer('w', 0, -1)], TICK_DT);
    const hit = runUntil(thrown, (s) => player(s, 'e').status.kind === 'dragged', 60);
    expect(player(hit.state, 'e').move).toEqual({ kind: 'steer', dir: at(-1, 0) });
    const dropped = runUntil(hit.state, (s) => player(s, 'e').status.kind === 'alive', 120).state;
    const later = run(dropped, 5).state;
    expect(player(later, 'e').pos.x).toBeLessThan(player(dropped, 'e').pos.x - stride * 4);
  });

  it('a hook latch cancels a walk toward a point', () => {
    const s0 = step(pinned(), [{ kind: 'move', playerId: pid('e'), target: at(2366, 1100) }], TICK_DT);
    const hit = runUntil(step(s0, hook('w', at(1500, 1100)), TICK_DT), (s) => player(s, 'e').status.kind === 'dragged', 90);
    expect(player(hit.state, 'e').move).toEqual(IDLE);
  });

  it('death and respawn keep a held steer, so the player walks again once back', () => {
    const doomed = withPlayer(pinned(), 'e', { hp: 1, move: { kind: 'steer', dir: at(-1, 0) } });
    const dead = runUntil(step(doomed, hook('w', at(1400 + r, 1100)), TICK_DT), (s) => player(s, 'e').status.kind === 'dead', 60);
    expect(player(dead.state, 'e').move).toEqual({ kind: 'steer', dir: at(-1, 0) });
    const back = runUntil(dead.state, (s) => player(s, 'e').status.kind === 'alive', 200).state;
    const spawn = back.arena.spawns.east[0]!;
    expect(player(run(back, 3).state, 'e').pos.x).toBeLessThan(spawn.x - stride * 2);
  });

  it('death cancels a walk toward a point', () => {
    const doomed = withPlayer(pinned(), 'e', { hp: 1, move: toward(at(2366, 1100)) });
    const dead = runUntil(step(doomed, hook('w', at(1400 + r, 1100)), TICK_DT), (s) => player(s, 'e').status.kind === 'dead', 60);
    expect(player(dead.state, 'e').move).toEqual(IDLE);
  });
});
