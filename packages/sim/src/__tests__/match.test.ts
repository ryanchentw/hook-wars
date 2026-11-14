import { describe, expect, it } from 'vitest';
import { createMatch, createRng, DEFAULT_ARENA, nextRandom, TUNING } from '../index';
import type { MatchPlayerConfig, TeamId } from '../index';
import { match, pid, player } from './helpers';

const cfg = (id: string, team: TeamId): MatchPlayerConfig => ({ id: pid(id), name: id, team, isBot: false });

describe('rng', () => {
  it('is deterministic per seed and stays in [0, 1)', () => {
    const draw = (seed: number) => {
      let rng = createRng(seed);
      const out: number[] = [];
      for (let i = 0; i < 1000; i++) {
        const [value, next] = nextRandom(rng);
        out.push(value);
        rng = next;
      }
      return out;
    };
    const a = draw(42);
    expect(draw(42)).toEqual(a);
    expect(draw(43)).not.toEqual(a);
    expect(a.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(new Set(a).size).toBeGreaterThan(990);
  });
});

describe('createMatch', () => {
  it('places players at their team spawns, facing the canal, ready to play', () => {
    const state = match([
      ['w1', 'west'],
      ['e1', 'east'],
      ['w2', 'west'],
    ]);
    expect(state.arena).toBe(DEFAULT_ARENA);
    expect(state).toMatchObject({ tick: 0, time: 0, events: [], hooks: [], phase: { kind: 'playing' } });
    expect(state.score).toEqual({ west: 0, east: 0 });
    expect(player(state, 'w2')).toMatchObject({
      spawnIndex: 1,
      pos: DEFAULT_ARENA.spawns.west[1],
      facing: 0,
      hp: TUNING.maxHp,
      status: { kind: 'alive' },
      hookReadyAt: 0,
      moveTarget: null,
      kills: 0,
      deaths: 0,
    });
    expect(player(state, 'e1')).toMatchObject({ spawnIndex: 0, pos: DEFAULT_ARENA.spawns.east[0], facing: Math.PI });
  });

  it('rejects invalid configs', () => {
    expect(() => createMatch({ killTarget: 3, players: [cfg('a', 'west')] })).toThrow(/east/);
    expect(() =>
      createMatch({
        killTarget: 3,
        players: [cfg('a', 'west'), cfg('b', 'west'), cfg('c', 'west'), cfg('d', 'west'), cfg('e', 'east')],
      }),
    ).toThrow(/west/);
    expect(() => createMatch({ killTarget: 3, players: [cfg('a', 'west'), cfg('a', 'east')] })).toThrow(/a/);
    expect(() => createMatch({ killTarget: 0, players: [cfg('a', 'west'), cfg('b', 'east')] })).toThrow(/killTarget/);
  });
});
