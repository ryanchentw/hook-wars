import { TUNING } from './config';
import type { GameEvent, GameState, Hook, HookId, Player, PlayerId } from './types';

/** What one stage of a step produces: the next state and the events it emitted. */
export type Outcome = { readonly state: GameState; readonly events: readonly GameEvent[] };

/** `t` is the sim time at the start of the step; every stage compares against it. */
export type StepContext = { readonly t: number; readonly dt: number; readonly events: readonly GameEvent[] };

export type Stage = (state: GameState, ctx: StepContext) => Outcome;

export function findPlayer(state: GameState, id: PlayerId): Player | undefined {
  return state.players.find((p) => p.id === id);
}

export function updatePlayer(state: GameState, id: PlayerId, update: (p: Player) => Player): GameState {
  return { ...state, players: state.players.map((p) => (p.id === id ? update(p) : p)) };
}

export function replaceHook(state: GameState, id: HookId, next: Hook | null): GameState {
  return {
    ...state,
    hooks: next === null ? state.hooks.filter((h) => h.id !== id) : state.hooks.map((h) => (h.id === id ? next : h)),
  };
}

export const isAlive = (p: Player): boolean => p.status.kind === 'alive';

/**
 * Enemies only ever meet because one of them was just put there. Making the arrival wait half an
 * interval turns a brawl into alternating blows instead of two swings landing on the same tick.
 */
export function landed(p: Player, t: number): Player {
  return { ...p, status: { kind: 'alive' }, meleeReadyAt: Math.max(p.meleeReadyAt, t + TUNING.meleeRecovery) };
}

export function ownsHook(state: GameState, id: PlayerId): boolean {
  return state.hooks.some((h) => h.ownerId === id);
}
