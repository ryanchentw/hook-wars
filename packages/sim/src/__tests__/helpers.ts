import { createMatch, step, TICK_DT } from '../index';
import type { GameEvent, GameState, Grapple, GrappleId, Hook, HookId, Pickup, PickupId, PickupKind, Player, PlayerId, PlayerInput, Purchase, TeamId, Vec2 } from '../index';

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

export const IDLE = { kind: 'idle' } as const;

export function steer(id: string, x: number, y: number): PlayerInput {
  return { kind: 'steer', playerId: pid(id), dir: at(x, y) };
}

export function buy(id: string, purchase: Purchase): PlayerInput {
  return { kind: 'buy', playerId: pid(id), purchase };
}

export function grapple(id: string, target: Vec2): PlayerInput {
  return { kind: 'grapple', playerId: pid(id), target };
}

/** Gives the player a grapple that is ready to use. */
export function armed(state: GameState, id: string): GameState {
  const p = player(state, id);
  return withPlayer(state, id, { items: { ...p.items, grapple: { kind: 'owned', readyAt: 0 } } });
}

/** Gives the player the barb. */
export function barbed(state: GameState, id: string): GameState {
  const p = player(state, id);
  return withPlayer(state, id, { items: { ...p.items, barb: { kind: 'owned' } } });
}

export function toward(target: Vec2) {
  return { kind: 'toward', target } as const;
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

/** West `w` and east `e` one-on-one, or more with extra ids, under fog unless told otherwise. */
export function fogMatch(roster: readonly (readonly [string, TeamId])[] = [['w', 'west'], ['e', 'east']], fog = true): GameState {
  return createMatch({ killTarget: 50, fog, players: roster.map(([id, team]) => ({ id: pid(id), name: id, team, isBot: false })) });
}

export function hookOf(owner: string, pos: { x: number; y: number }, patch: Partial<Hook> = {}): Hook {
  return {
    id: `${owner}-hook` as HookId,
    ownerId: pid(owner),
    pos,
    dir: { x: 1, y: 0 },
    path: [{ x: 400, y: 600 }],
    phase: { kind: 'extending', remaining: 500 },
    stats: { damage: 350, range: 1300, speed: 1100, retractSpeed: 1300, radius: 26, barbed: false },
    ...patch,
  };
}

export function grappleOf(owner: string, pos: { x: number; y: number }): Grapple {
  return { id: `${owner}-grapple` as GrappleId, ownerId: pid(owner), pos, anchor: pos, phase: { kind: 'flying' } };
}


/** A match with the water sending pickups, seeded `seed`. */
export function riverMatch(roster: readonly (readonly [string, TeamId])[], seed = 7, fog = false): GameState {
  return createMatch({ killTarget: 50, fog, pickups: true, seed, players: roster.map(([id, team]) => ({ id: pid(id), name: id, team, isBot: false })) });
}

/** Floats a `kind` pickup at `pos`, in the lane through it, drifting south unless told otherwise. */
export function withPickup(state: GameState, kind: PickupKind, pos: Vec2, patch: Partial<Pickup> = {}): GameState {
  const pickup: Pickup = { id: `p${state.nextPickupSeq}` as PickupId, kind, pos, from: 'north', lane: pos.x, state: { kind: 'drifting' }, ...patch };
  return { ...state, nextPickupSeq: state.nextPickupSeq + 1, pickups: [...state.pickups, pickup] };
}

export function hook(id: string, target: Vec2): PlayerInput {
  return { kind: 'hook', playerId: pid(id), target };
}
