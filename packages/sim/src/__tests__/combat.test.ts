import { describe, expect, it } from 'vitest';
import { step, TICK_DT, TUNING } from '../index';
import type { GameState } from '../index';
import { at, deepFreeze, match, ofKind, pid, player, run, runUntil, withPlayer } from './helpers';

function brawl(killTarget = 50, eHp: number = TUNING.maxHp): GameState {
  const s = match(
    [
      ['w', 'west'],
      ['e', 'east'],
    ],
    killTarget,
  );
  return withPlayer(withPlayer(s, 'w', { pos: at(880, 335) }), 'e', { pos: at(950, 335), hp: eHp });
}

describe('melee', () => {
  it('adjacent enemies trade blows on the interval', () => {
    const first = step(brawl(), [], TICK_DT);
    expect(ofKind(first.events, 'melee')).toHaveLength(2);
    expect(player(first, 'w').hp).toBe(TUNING.maxHp - TUNING.meleeDamage);
    expect(player(first, 'e').hp).toBe(TUNING.maxHp - TUNING.meleeDamage);

    const second = run(brawl(), 30);
    expect(ofKind(second.events, 'melee')).toHaveLength(4);
  });

  it('does not reach across the canal', () => {
    const far = withPlayer(brawl(), 'e', { pos: at(1434, 335) });
    expect(ofKind(run(far, 30).events, 'melee')).toEqual([]);
  });

  it('a kill credits the killer and their team, and the victim respawns at spawn after the delay', () => {
    const killed = step(brawl(50, 100), [], TICK_DT);
    expect(ofKind(killed.events, 'kill')).toEqual([{ kind: 'kill', killerId: 'w', victimId: 'e', at: at(950, 335) }]);
    expect(player(killed, 'w').kills).toBe(1);
    expect(player(killed, 'e')).toMatchObject({ deaths: 1, status: { kind: 'dead', respawnAt: TUNING.respawnDelay } });
    expect(killed.score).toEqual({ west: 1, east: 0 });

    const ignored = step(killed, [{ kind: 'move', playerId: pid('e'), target: at(500, 500) }], TICK_DT);
    expect(player(ignored, 'e').moveTarget).toBeNull();
    expect(ofKind(run(ignored, 30).events, 'melee')).toEqual([]);

    const back = runUntil(killed, (s) => player(s, 'e').status.kind === 'alive', 200);
    expect(ofKind(back.events, 'respawn')).toEqual([{ kind: 'respawn', playerId: 'e' }]);
    expect(back.state.time).toBeGreaterThanOrEqual(TUNING.respawnDelay);
    expect(player(back.state, 'e')).toMatchObject({ pos: back.state.arena.spawns.east[0], hp: TUNING.maxHp, moveTarget: null });
  });

  it('a hook can land the killing blow, and the hook keeps retracting empty', () => {
    let s = match([
      ['w', 'west'],
      ['e', 'east'],
    ]);
    s = withPlayer(withPlayer(s, 'w', { pos: at(420, 335) }), 'e', { pos: at(1600, 335), hp: 300 });
    s = step(s, [{ kind: 'hook', playerId: pid('w'), target: at(1600, 335) }], TICK_DT);
    const done = runUntil(s, (x) => x.events.some((e) => e.kind === 'kill'), 60).state;
    expect(ofKind(done.events, 'kill')[0]).toMatchObject({ killerId: 'w', victimId: 'e' });
    expect(done.hooks[0]?.phase).toEqual({ kind: 'retracting', cargo: null });
    const after = runUntil(done, (x) => x.hooks.length === 0, 100).state;
    expect(player(after, 'e').status.kind).toBe('dead');
  });
});

describe('match end', () => {
  it('ends when a team reaches killTarget, and later steps change nothing', () => {
    const ended = step(brawl(1, 100), [], TICK_DT);
    expect(ended.phase).toEqual({ kind: 'ended', winner: 'west' });
    expect(ofKind(ended.events, 'matchEnd')).toEqual([{ kind: 'matchEnd', winner: 'west' }]);

    const frozen = deepFreeze(ended);
    const later = step(frozen, [{ kind: 'move', playerId: pid('w'), target: at(100, 100) }], TICK_DT);
    expect(later).toEqual({ ...ended, events: [] });
  });
});

describe('determinism', () => {
  it('does not mutate its input and gives deep-equal results for equal inputs', () => {
    const s0 = deepFreeze(
      withPlayer(withPlayer(brawl(), 'w', { pos: at(420, 335) }), 'e', { pos: at(1600, 335) }),
    );
    const inputs = deepFreeze([
      { kind: 'hook', playerId: pid('w'), target: at(1600, 335) },
      { kind: 'move', playerId: pid('e'), target: at(1700, 335) },
    ] as const);
    const a = run(s0, 150, inputs);
    const b = run(s0, 150, inputs);
    expect(a).toEqual(b);
    expect(ofKind(a.events, 'hookHit')).toHaveLength(1);
  });
});
