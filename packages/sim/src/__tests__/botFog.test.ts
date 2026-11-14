import { describe, expect, it } from 'vitest';
import { walkableRect } from '../arena';
import { botThink, createBotBrain, createMatch, step, TICK_DT, TUNING } from '../index';
import type { BotBrain, GameState, PlayerId, PlayerInput, TeamId } from '../index';
import { at, pid, withPlayer } from './helpers';

function botMatch(perTeam: number, fog: boolean): GameState {
  const teams: TeamId[] = ['west', 'east'];
  return createMatch({
    killTarget: 3,
    fog,
    players: teams.flatMap((team) =>
      Array.from({ length: perTeam }, (_, i) => ({ id: pid(`${team}${i}`), name: `${team}${i}`, team, isBot: true })),
    ),
  });
}

/** West bot at (420, 335), east bot 1180 east of it: inside hook reach, outside sight. */
const duel = (fog = true): GameState =>
  withPlayer(withPlayer(botMatch(1, fog), 'west0', { pos: at(420, 335) }), 'east0', { pos: at(1600, 335) });

const thoughts = (s: GameState, seeds = 40): readonly PlayerInput[] =>
  Array.from({ length: seeds }, (_, seed) => botThink(s, pid('west0'), createBotBrain(seed)).inputs).flat();
const throwsAt = (s: GameState) => thoughts(s).filter((i) => i.kind === 'hook');

function playBots(perTeam: number, seed: number): GameState {
  let state = botMatch(perTeam, true);
  let brains = new Map<PlayerId, BotBrain>(state.players.map((p, i) => [p.id, createBotBrain(seed * 31 + i)]));
  for (let i = 0; i < Math.round(600 / TICK_DT) && state.phase.kind === 'playing'; i++) {
    const thought = state.players.map((p) => ({ id: p.id, ...botThink(state, p.id, brains.get(p.id) ?? createBotBrain(0)) }));
    brains = new Map(thought.map((x) => [x.id, x.brain]));
    state = step(state, thought.flatMap((x) => x.inputs), TICK_DT);
  }
  return state;
}

describe('bots under fog', () => {
  it('never throws at an enemy its team cannot see, though one it could see in the same spot draws throws', () => {
    expect(throwsAt(duel(false)).length).toBeGreaterThan(5);
    expect(throwsAt(duel())).toEqual([]);
  });

  it('throws once the enemy steps into sight, leading their walk', () => {
    const seen = withPlayer(withPlayer(duel(), 'west0', { pos: at(700, 335) }), 'east0', {
      pos: at(1500, 335),
      move: { kind: 'toward', target: at(1500, 1200) },
    });
    const throws = throwsAt(seen);
    expect(throws.length).toBeGreaterThan(5);
    throws.forEach((h) => expect(h.kind === 'hook' && h.target.y > 335).toBe(true));
  });

  it('sees through a teammate', () => {
    const roster = createMatch({
      killTarget: 3,
      fog: true,
      players: [
        { id: pid('west0'), name: 'a', team: 'west', isBot: true },
        { id: pid('west1'), name: 'b', team: 'west', isBot: true },
        { id: pid('east0'), name: 'c', team: 'east', isBot: true },
      ],
    });
    const s = withPlayer(withPlayer(withPlayer(roster, 'west0', { pos: at(420, 335) }), 'east0', { pos: at(1600, 335) }), 'west1', {
      pos: at(900, 335),
    });
    expect(throwsAt(s).length).toBeGreaterThan(5);
  });

  it('with nobody in sight, walks to the waterfront of its own dock to look across', () => {
    const rect = walkableRect(duel().arena, 'west');
    const front = rect.x1 - (rect.x1 - rect.x0) * TUNING.botScoutDepth;
    const moves = thoughts(duel()).filter((i) => i.kind === 'move');
    expect(moves.length).toBe(40);
    moves.forEach((m) => expect(m.kind === 'move' && m.target.x >= front - 1e-9 && m.target.x <= rect.x1).toBe(true));
    expect(new Set(moves.map((m) => (m.kind === 'move' ? Math.round(m.target.y) : 0))).size).toBeGreaterThan(10);
  });

  it('keeps wandering its whole dock with open vision', () => {
    const rect = walkableRect(duel().arena, 'west');
    const front = rect.x1 - (rect.x1 - rect.x0) * TUNING.botScoutDepth;
    const empty = withPlayer(duel(false), 'east0', { status: { kind: 'dead', respawnAt: 9 } });
    const xs = thoughts(empty).flatMap((i) => (i.kind === 'move' ? [i.target.x] : []));
    expect(xs.some((x) => x < front)).toBe(true);
  });

  it('a seeded 3v3 under fog still finds its fights and ends within 10 minutes', () => {
    const s = playBots(3, 11);
    expect(s.phase.kind).toBe('ended');
    expect(s.time).toBeLessThan(600);
  });
});
