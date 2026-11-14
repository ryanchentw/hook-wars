import { checkWin, resolveDeaths, resolveMelee } from './combat';
import { settleEconomy } from './economy';
import { advanceGrapples } from './grapple';
import { advanceHooks } from './hooks';
import { applyInputs } from './inputs';
import { movePlayers, respawnPlayers } from './movement';
import { separatePlayers } from './separation';
import type { GameEvent, GameState, PlayerInput } from './types';
import type { Outcome, Stage } from './world';

const STAGES: readonly Stage[] = [
  settleEconomy,
  respawnPlayers,
  movePlayers,
  advanceHooks,
  advanceGrapples,
  separatePlayers,
  resolveMelee,
  resolveDeaths,
  checkWin,
];

/** Advances the match by `dt` seconds. Never mutates `state`. */
export function step(state: GameState, inputs: readonly PlayerInput[], dt: number): GameState {
  if (state.phase.kind === 'ended') return { ...state, events: [] };
  const t = state.time;
  const start = applyInputs(state, inputs, t);
  const end = STAGES.reduce<Outcome>((acc, stage) => {
    const next = stage(acc.state, { t, dt, events: acc.events });
    return { state: next.state, events: [...acc.events, ...next.events] };
  }, start);
  const events: readonly GameEvent[] = end.events;
  return { ...end.state, tick: state.tick + 1, time: t + dt, events };
}
