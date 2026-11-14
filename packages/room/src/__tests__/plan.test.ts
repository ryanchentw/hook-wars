import { botThink, createBotBrain, createMatch, step, TICK_DT } from '@hookbrawl/sim';
import type { BotBrain, GameState } from '@hookbrawl/sim';
import { describe, expect, it } from 'vitest';
import { createRoom, parseName, reduce, SCENE_IDS, toMatchConfig, upcomingScene } from '../index';
import type { MatchPlan, MemberId, RoomAction, RoomState } from '../index';

const HOST = 'host' as MemberId;
const play = (state: RoomState, ...actions: readonly RoomAction[]): RoomState => actions.reduce(reduce, state);
const joined = (): RoomState => play(createRoom(), { kind: 'join', by: HOST, name: 'Ryan' });
const duel = (): RoomState => play(joined(), { kind: 'addBot', by: HOST, slot: { team: 'east', index: 0 } });
const full = (): RoomState => play(joined(), { kind: 'fillWithBots', by: HOST });
const start = (room: RoomState): RoomState => reduce(room, { kind: 'startMatch', by: HOST });

function planOf(room: RoomState, seed: number): MatchPlan {
  const plan = toMatchConfig(room, seed);
  if (plan === null) throw new Error('expected a plan');
  return plan;
}

describe('toMatchConfig', () => {
  it('has nothing to offer outside a match', () => {
    expect(toMatchConfig(duel(), 1)).toBeNull();
  });

  it('turns a 1v1 into the sim config, west first, with the bot seeded from the seed', () => {
    const plan = planOf(start(duel()), 42);
    expect(plan.config.killTarget).toBe(10);
    expect(plan.config.fog).toBe(true);
    expect(plan.config.players).toEqual([
      { id: 'west-0', name: 'Ryan', team: 'west', isBot: false },
      { id: 'east-0', name: expect.any(String), team: 'east', isBot: true },
    ]);
    expect(plan.seats).toEqual([
      { kind: 'human', playerId: 'west-0', slot: { team: 'west', index: 0 }, memberId: HOST },
      { kind: 'bot', playerId: 'east-0', slot: { team: 'east', index: 0 }, seed: 42 },
    ]);
  });

  it('carries fog of war into the match, and its absence when the host turns it off', () => {
    expect(createMatch(planOf(start(duel()), 1).config).vision.kind).toBe('fog');
    const clear = play(duel(), { kind: 'setFog', by: HOST, fog: false });
    expect(planOf(start(clear), 1).config.fog).toBe(false);
    expect(createMatch(planOf(start(clear), 1).config).vision.kind).not.toBe('fog');
  });

  it('gives a full room six fighters with distinct names and seeds, and the sim accepts it', () => {
    const plan = planOf(start(full()), 7);
    expect(plan.config.players).toHaveLength(6);
    expect(new Set(plan.config.players.map((p) => p.name)).size).toBe(6);
    expect(plan.seats.flatMap((s) => (s.kind === 'bot' ? [s.seed] : []))).toEqual([7, 8, 9, 10, 11]);
    expect(createMatch(plan.config).players).toHaveLength(6);
  });

  it('works for uneven sides', () => {
    const room = play(joined(), { kind: 'addBot', by: HOST, slot: { team: 'west', index: 2 } }, { kind: 'addBot', by: HOST, slot: { team: 'east', index: 1 } });
    const state = createMatch(planOf(start(room), 1).config);
    expect(state.players.map((p) => [p.id, p.spawnIndex])).toEqual([
      ['west-0', 0],
      ['west-2', 1],
      ['east-1', 0],
    ]);
  });

  it('plays the chosen scene every time, or the next one in turn when rotating', () => {
    const daan = play(duel(), { kind: 'setScene', by: HOST, scene: 'daan' });
    expect(planOf(start(daan), 1).scene).toBe('daan');
    let room = duel();
    const seen = SCENE_IDS.map(() => {
      expect(upcomingScene(room)).toBe(SCENE_IDS[room.matchesStarted % SCENE_IDS.length]);
      room = start(room);
      const scene = planOf(room, 1).scene;
      room = reduce(room, { kind: 'endMatch', by: HOST });
      return scene;
    });
    expect(seen).toEqual([...SCENE_IDS]);
    expect(upcomingScene(room)).toBe(SCENE_IDS[0]);
  });
});

describe('parseName', () => {
  it('trims and accepts 1 to 16 characters, counting an emoji as one', () => {
    expect(parseName('  Ryan ')).toEqual({ ok: true, name: 'Ryan' });
    expect(parseName('x'.repeat(16)).ok).toBe(true);
    expect(parseName('🪝'.repeat(16)).ok).toBe(true);
    expect(parseName('鉤子王')).toEqual({ ok: true, name: '鉤子王' });
  });

  it('refuses empty, long, control characters and non-strings, saying why', () => {
    expect(parseName('   ')).toEqual({ ok: false, error: 'Enter a name.' });
    expect(parseName('x'.repeat(17))).toEqual({ ok: false, error: 'Use at most 16 characters.' });
    expect(parseName('tab\there')).toEqual({ ok: false, error: 'Use letters, numbers and punctuation only.' });
    expect(parseName('line break').ok).toBe(false);
    expect(parseName(42).ok).toBe(false);
  });
});

const MATCH_LIMIT_SECONDS = 600;

function runToEnd(plan: MatchPlan): GameState {
  let state = createMatch(plan.config);
  let brains: readonly BotBrain[] = plan.seats.map((s) => createBotBrain(s.kind === 'bot' ? s.seed : 0));
  while (state.phase.kind === 'playing' && state.time < MATCH_LIMIT_SECONDS) {
    const current = state;
    const results = plan.seats.map((s, i) => botThink(current, s.playerId, brains[i]!));
    brains = results.map((r) => r.brain);
    state = step(state, results.flatMap((r) => r.inputs), TICK_DT);
  }
  return state;
}

describe('a full room of bots', () => {
  it('plays a 3v3 to the kill target, with every fighter scoring or assisting', { timeout: 60_000 }, () => {
    const plan = planOf(start(full()), 101);
    // The host's seat is driven by a bot too, so nobody stands still.
    const end = runToEnd({ ...plan, seats: plan.seats.map((s) => (s.kind === 'bot' ? s : { ...s, kind: 'bot', seed: 100 })) });
    expect(end.phase.kind).toBe('ended');
    expect(Math.max(end.score.west, end.score.east)).toBe(10);
    expect(end.players.every((p) => p.kills + p.assists > 0)).toBe(true);
  });
});
