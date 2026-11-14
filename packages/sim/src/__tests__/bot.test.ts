import { describe, expect, it } from 'vitest';
import { botThink, createBotBrain, createMatch, step, TICK_DT, TUNING } from '../index';
import type { BotBrain, GameState, PlayerId, PlayerInput, TeamId } from '../index';
import { at, pid, withPlayer } from './helpers';

function botMatch(perTeam: number, killTarget: number): GameState {
  const teams: TeamId[] = ['west', 'east'];
  return createMatch({
    killTarget,
    players: teams.flatMap((team) =>
      Array.from({ length: perTeam }, (_, i) => ({ id: pid(`${team}${i}`), name: `${team}${i}`, team, isBot: true })),
    ),
  });
}

function assertInvariants(s: GameState): void {
  const r = TUNING.playerRadius;
  s.players.forEach((p) => {
    expect(p.pos.x >= 0 && p.pos.x <= s.arena.width && p.pos.y >= 0 && p.pos.y <= s.arena.height).toBe(true);
    if (p.status.kind === 'alive') {
      expect(p.pos.x <= s.arena.canal.x0 - r || p.pos.x >= s.arena.canal.x1 + r).toBe(true);
    }
  });
}

function playBots(perTeam: number, seed: number): GameState {
  let state = botMatch(perTeam, 3);
  let brains = new Map<PlayerId, BotBrain>(state.players.map((p, i) => [p.id, createBotBrain(seed * 31 + i)]));
  const maxTicks = Math.round(600 / TICK_DT);
  for (let i = 0; i < maxTicks && state.phase.kind === 'playing'; i++) {
    const thoughts = state.players.map((p) => ({ id: p.id, ...botThink(state, p.id, brains.get(p.id) ?? createBotBrain(0)) }));
    brains = new Map(thoughts.map((x) => [x.id, x.brain]));
    state = step(state, thoughts.flatMap((x) => x.inputs), TICK_DT);
    assertInvariants(state);
  }
  return state;
}

const duel = (): GameState =>
  withPlayer(
    withPlayer(botMatch(1, 3), 'west0', { pos: at(420, 335) }),
    'east0',
    { pos: at(1600, 335) },
  );

describe('botThink', () => {
  it('stays quiet before its next think time and while not alive', () => {
    const brain = { ...createBotBrain(1), nextThinkAt: 5 };
    expect(botThink(duel(), pid('west0'), brain)).toEqual({ inputs: [], brain });
    const dead = withPlayer(duel(), 'west0', { status: { kind: 'dead', respawnAt: 9 } });
    expect(botThink(dead, pid('west0'), createBotBrain(1)).inputs).toEqual([]);
  });

  it('schedules the next think', () => {
    const { brain } = botThink(duel(), pid('west0'), createBotBrain(1));
    expect(brain.nextThinkAt).toBeCloseTo(TUNING.botThinkInterval, 9);
  });

  it('chases an enemy on its own dock', () => {
    const s = withPlayer(duel(), 'east0', { pos: at(600, 400) });
    const { inputs } = botThink(s, pid('west0'), createBotBrain(3));
    expect(inputs).toContainEqual({ kind: 'move', playerId: 'west0', target: at(600, 400) });
  });

  it('wanders to a point on its own dock when idle', () => {
    const { inputs } = botThink(duel(), pid('west0'), createBotBrain(3));
    const move = inputs.find((i) => i.kind === 'move');
    expect(move?.kind === 'move' && move.target.x < 1000 - TUNING.playerRadius + 1e-9).toBe(true);
  });

  it('throws at a lead-predicted point within the aim noise, some of the time', () => {
    const moving = withPlayer(duel(), 'east0', { moveTarget: at(1600, 1200) });
    const lead = { x: 1600, y: 335 + TUNING.moveSpeed * (1180 / TUNING.hookSpeed) };
    const ideal = Math.atan2(lead.y - 335, lead.x - 420);
    const throws = Array.from({ length: 40 }, (_, seed) => botThink(moving, pid('west0'), createBotBrain(seed)).inputs)
      .flat()
      .filter((i): i is Extract<PlayerInput, { kind: 'hook' }> => i.kind === 'hook');
    expect(throws.length).toBeGreaterThan(5);
    expect(throws.length).toBeLessThan(35);
    throws.forEach((h) => {
      const angle = Math.atan2(h.target.y - 335, h.target.x - 420);
      expect(Math.abs(angle - ideal)).toBeLessThanOrEqual(TUNING.botAimNoise + 1e-9);
    });
  });

  it('does not throw while its hook is cooling down', () => {
    const cooling = withPlayer(duel(), 'west0', { hookReadyAt: 10 });
    const throws = Array.from({ length: 20 }, (_, seed) => botThink(cooling, pid('west0'), createBotBrain(seed)).inputs)
      .flat()
      .filter((i) => i.kind === 'hook');
    expect(throws).toEqual([]);
  });
});

describe('bot matches', () => {
  it('a seeded 1v1 ends within 10 minutes, deterministically, with everyone in bounds', () => {
    const a = playBots(1, 7);
    expect(a.phase.kind).toBe('ended');
    expect(a.time).toBeLessThan(600);
    expect(playBots(1, 7)).toEqual(a);
  });

  it('a seeded 3v3 ends within 10 minutes with everyone in bounds', () => {
    const s = playBots(3, 11);
    expect(s.phase.kind).toBe('ended');
    expect(s.time).toBeLessThan(600);
    const winner = s.phase.kind === 'ended' ? s.phase.winner : 'west';
    expect(s.score[winner]).toBeGreaterThanOrEqual(3);
    expect(s.players.filter((p) => p.team === winner).reduce((n, p) => n + p.kills, 0)).toBe(s.score[winner]);
  });
});
