import { clampToDock, dockAt } from './arena';
import { TUNING } from './config';
import { normalize, sub } from './geometry';
import type { GameEvent, GameState, HookId, Player, PlayerInput, Vec2 } from './types';
import { findPlayer, isAlive, ownsHook, updatePlayer, type Outcome } from './world';

function castHook(state: GameState, player: Player, target: Vec2, t: number): Outcome {
  const none = { state, events: [] };
  if (t < player.hookReadyAt || ownsHook(state, player.id)) return none;
  if (target.x === player.pos.x && target.y === player.pos.y) return none;
  const dir = normalize(sub(target, player.pos));
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
        phase: { kind: 'extending', remaining: TUNING.hookRange },
      },
    ],
  };
  return {
    state: updatePlayer(withHook, player.id, (p) => ({ ...p, facing: Math.atan2(dir.y, dir.x) })),
    events: [cast],
  };
}

function applyInput(state: GameState, input: PlayerInput, t: number): Outcome {
  const player = findPlayer(state, input.playerId);
  if (!player || !isAlive(player)) return { state, events: [] };
  switch (input.kind) {
    case 'move': {
      const moveTarget = clampToDock(state.arena, input.target, dockAt(state.arena, player.pos));
      return { state: updatePlayer(state, player.id, (p) => ({ ...p, moveTarget })), events: [] };
    }
    case 'stop':
      return { state: updatePlayer(state, player.id, (p) => ({ ...p, moveTarget: null })), events: [] };
    case 'hook':
      return castHook(state, player, input.target, t);
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
