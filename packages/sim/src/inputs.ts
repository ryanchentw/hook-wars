import { clampToDock, dockAt } from './arena';
import { normalize, sub } from './geometry';
import { boostHook } from './effects';
import { castGrapple } from './grapple';
import { IDLE, steerIntent } from './intent';
import { buy, hookStats } from './shop';
import type { GameEvent, GameState, HookId, MoveIntent, Player, PlayerInput, Purchase, Vec2 } from './types';
import { findPlayer, isAlive, ownsHook, updatePlayer, type Outcome } from './world';

function castHook(state: GameState, player: Player, target: Vec2, t: number): Outcome {
  const none = { state, events: [] };
  if (t < player.hookReadyAt || ownsHook(state, player.id)) return none;
  if (target.x === player.pos.x && target.y === player.pos.y) return none;
  const dir = normalize(sub(target, player.pos));
  const stats = boostHook(hookStats(player), player);
  const id = `h${state.nextHookSeq}` as HookId;
  const cast: GameEvent = { kind: 'hookCast', hookId: id, ownerId: player.id };
  const withHook: GameState = {
    ...state,
    nextHookSeq: state.nextHookSeq + 1,
    hooks: [
      ...state.hooks,
      {
        id,
        ownerId: player.id,
        pos: player.pos,
        dir,
        path: [player.pos],
        phase: { kind: 'extending', remaining: stats.range },
        stats,
      },
    ],
  };
  return {
    state: updatePlayer(withHook, player.id, (p) => ({ ...p, facing: Math.atan2(dir.y, dir.x) })),
    events: [cast],
  };
}

function setMove(state: GameState, player: Player, move: MoveIntent): Outcome {
  return { state: updatePlayer(state, player.id, (p) => ({ ...p, move })), events: [] };
}

function purchase(state: GameState, player: Player, wanted: Purchase, t: number): Outcome {
  const { player: next, event } = buy(player, wanted, t);
  return event ? { state: updatePlayer(state, player.id, () => next), events: [event] } : { state, events: [] };
}

function applyInput(state: GameState, input: PlayerInput, t: number): Outcome {
  const none = { state, events: [] };
  const player = findPlayer(state, input.playerId);
  if (!player) return none;
  switch (input.kind) {
    case 'steer':
      return setMove(state, player, steerIntent(input.dir));
    case 'stop':
      return setMove(state, player, IDLE);
    case 'move': {
      if (!isAlive(player)) return none;
      const target = clampToDock(state.arena, input.target, dockAt(state.arena, player.pos));
      return setMove(state, player, { kind: 'toward', target });
    }
    case 'hook':
      return isAlive(player) ? castHook(state, player, input.target, t) : none;
    case 'buy':
      return purchase(state, player, input.purchase, t);
    case 'grapple':
      return castGrapple(state, player, input.target, t);
  }
}

export function applyInputs(state: GameState, inputs: readonly PlayerInput[], t: number): Outcome {
  return inputs.reduce<Outcome>(
    (acc, input) => {
      const next = applyInput(acc.state, input, t);
      return { state: next.state, events: [...acc.events, ...next.events] };
    },
    { state, events: [] },
  );
}
