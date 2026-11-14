import { createMatch, step, TICK_DT } from '../index';
import type { GameEvent, GameState, Player, PlayerId, PlayerInput, TeamId, Vec2 } from '../index';

export const pid = (id: string): PlayerId => id as PlayerId;

export function match(
  roster: readonly (readonly [string, TeamId])[],
  killTarget = 50,
): GameState {
  return createMatch({
    killTarget,
    players: roster.map(([id, team]) => ({ id: pid(id), name: id, team, isBot: false })),
  });
}

export function player(state: GameState, id: string): Player {
  const found = state.players.find((p) => p.id === id);
  if (!found) throw new Error(`no player ${id}`);
  return found;
}

export function withPlayer(state: GameState, id: string, patch: Partial<Player>): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === id ? { ...p, ...patch } : p)),
  };
}

export function at(x: number, y: number): Vec2 {
  return { x, y };
}

export type Trace = { readonly state: GameState; readonly events: readonly GameEvent[] };

/** Steps `ticks` times, sending `first` on the first step only, and collects every event. */
export function run(
  state: GameState,
  ticks: number,
  first: readonly PlayerInput[] = [],
  dt = TICK_DT,
): Trace {
  let current = state;
  const events: GameEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    current = step(current, i === 0 ? first : [], dt);
    events.push(...current.events);
  }
  return { state: current, events };
}

export function runUntil(
  state: GameState,
  done: (s: GameState) => boolean,
  maxTicks: number,
  dt = TICK_DT,
): Trace {
  let current = state;
  const events: GameEvent[] = [];
  for (let i = 0; i < maxTicks && !done(current); i++) {
    current = step(current, [], dt);
    events.push(...current.events);
  }
  if (!done(current)) throw new Error('condition not reached');
  return { state: current, events };
}

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

export function ofKind<K extends GameEvent['kind']>(
  events: readonly GameEvent[],
  kind: K,
): Extract<GameEvent, { kind: K }>[] {
  return events.filter((e): e is Extract<GameEvent, { kind: K }> => e.kind === kind);
}
