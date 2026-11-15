import { DEFAULT_ARENA, viewFor } from '@hookwars/sim';
import type { GameState, Player, PlayerId, PlayerInput, TeamView } from '@hookwars/sim';
import type { SimApi } from './session';

export const HUMAN = 'human' as PlayerId;
export const BOT = 'bot' as PlayerId;

export function fakePlayer(overrides: Partial<Player> & Pick<Player, 'id'>): Player {
  return {
    name: overrides.id,
    team: 'west',
    isBot: false,
    spawnIndex: 0,
    pos: { x: 0, y: 0 },
    facing: 0,
    move: { kind: 'idle' },
    hp: 1500,
    status: { kind: 'alive' },
    hookReadyAt: 0,
    meleeReadyAt: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    gold: 150,
    earned: 150,
    upgrades: { damage: 0, range: 0, speed: 0, size: 0 },
    items: { grapple: { kind: 'unowned' }, barb: { kind: 'unowned' } },
    recentDamage: [],
    effects: [],
    ...overrides,
  };
}

export function fakeState(overrides: Partial<GameState> = {}): GameState {
  return {
    tick: 0,
    time: 0,
    arena: DEFAULT_ARENA,
    players: [fakePlayer({ id: HUMAN }), fakePlayer({ id: BOT, team: 'east', isBot: true })],
    hooks: [],
    grapples: [],
    pickups: [],
    river: null,
    score: { west: 0, east: 0 },
    killTarget: 5,
    vision: { kind: 'open' },
    phase: { kind: 'playing' },
    nextHookSeq: 0,
    nextGrappleSeq: 0,
    nextPickupSeq: 0,
    events: [],
    ...overrides,
  };
}

/** What the west side sees of `fakeState(overrides)`; open vision unless the overrides fog it. */
export function fakeView(overrides: Partial<GameState> = {}): TeamView {
  return viewFor(fakeState(overrides), 'west');
}

export type FakeSim = SimApi & { readonly stepped: (readonly PlayerInput[])[]; readonly matches: { count: number } };

/** A stand-in for the sim that only advances the clock and records every input batch it received. */
export function createFakeSim(endAtTick = Number.POSITIVE_INFINITY): FakeSim {
  const stepped: (readonly PlayerInput[])[] = [];
  const matches = { count: 0 };
  return {
    stepped,
    matches,
    createMatch: () => {
      matches.count += 1;
      return fakeState();
    },
    step: (state, inputs, dt) => {
      stepped.push(inputs);
      const tick = state.tick + 1;
      return {
        ...state,
        tick,
        time: state.time + dt,
        events: [],
        phase: tick >= endAtTick ? { kind: 'ended', winner: 'west' } : state.phase,
      };
    },
    createBotBrain: (seed) => ({ rng: { seed }, nextThinkAt: 0 }),
    botThink: (_state, botId, brain) => ({ inputs: [{ kind: 'stop', playerId: botId }], brain }),
    viewFor,
  };
}
