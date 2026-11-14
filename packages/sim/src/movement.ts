import { facingCanal, spawnPoint } from './arena';
import { TUNING } from './config';
import { along, distance, normalize, sub } from './geometry';
import type { GameEvent, GameState, Player } from './types';
import type { Stage } from './world';

function respawn(state: GameState, p: Player): Player {
  return {
    ...p,
    pos: spawnPoint(state.arena, p.team, p.spawnIndex),
    facing: facingCanal(p.team),
    hp: TUNING.maxHp,
    status: { kind: 'alive' },
    moveTarget: null,
  };
}

export const respawnPlayers: Stage = (state, { t }) => {
  const due = (p: Player) => p.status.kind === 'dead' && p.status.respawnAt <= t;
  const events: GameEvent[] = state.players.filter(due).map((p) => ({ kind: 'respawn', playerId: p.id }));
  return {
    state: { ...state, players: state.players.map((p) => (due(p) ? respawn(state, p) : p)) },
    events,
  };
};

function walk(p: Player, dt: number): Player {
  if (p.status.kind !== 'alive' || p.moveTarget === null) return p;
  const remaining = distance(p.pos, p.moveTarget);
  const stride = TUNING.moveSpeed * dt;
  if (remaining === 0) return { ...p, moveTarget: null };
  const dir = normalize(sub(p.moveTarget, p.pos));
  const facing = Math.atan2(dir.y, dir.x);
  if (remaining <= stride) return { ...p, pos: p.moveTarget, moveTarget: null, facing };
  return { ...p, pos: along(p.pos, dir, stride), facing };
}

export const movePlayers: Stage = (state, { dt }) => ({
  state: { ...state, players: state.players.map((p) => walk(p, dt)) },
  events: [],
});
