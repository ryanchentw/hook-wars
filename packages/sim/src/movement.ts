import { clampToDock, dockAt, facingCanal, spawnPoint } from './arena';
import { TUNING } from './config';
import { along, distance, normalize, sub } from './geometry';
import { IDLE, interrupt } from './intent';
import type { Arena, GameEvent, GameState, Player, Vec2 } from './types';
import type { Stage } from './world';

function respawn(state: GameState, p: Player): Player {
  return {
    ...p,
    pos: spawnPoint(state.arena, p.team, p.spawnIndex),
    facing: facingCanal(p.team),
    hp: TUNING.maxHp,
    status: { kind: 'alive' },
    move: interrupt(p.move),
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

/** A stagger that has run out puts the player back on their feet before anyone moves this step. */
export const recoverPlayers: Stage = (state, { t }) => ({
  state: {
    ...state,
    players: state.players.map((p) =>
      p.status.kind === 'staggered' && p.status.until <= t ? { ...p, status: { kind: 'alive' } } : p,
    ),
  },
  events: [],
});

function walkToward(p: Player, target: Vec2, stride: number): Player {
  const remaining = distance(p.pos, target);
  if (remaining === 0) return { ...p, move: IDLE };
  const dir = normalize(sub(target, p.pos));
  const facing = Math.atan2(dir.y, dir.x);
  if (remaining <= stride) return { ...p, pos: target, move: IDLE, facing };
  return { ...p, pos: along(p.pos, dir, stride), facing };
}

/** Clamping each axis separately is what lets a diagonal push slide along a wall. */
function walkSteer(arena: Arena, p: Player, dir: Vec2, stride: number): Player {
  const pos = clampToDock(arena, along(p.pos, dir, stride), dockAt(arena, p.pos));
  return { ...p, pos, facing: Math.atan2(dir.y, dir.x) };
}

function walk(arena: Arena, p: Player, dt: number): Player {
  if (p.status.kind !== 'alive') return p;
  const stride = TUNING.moveSpeed * dt;
  switch (p.move.kind) {
    case 'idle':
      return p;
    case 'toward':
      return walkToward(p, p.move.target, stride);
    case 'steer':
      return walkSteer(arena, p, p.move.dir, stride);
  }
}

export const movePlayers: Stage = (state, { dt }) => ({
  state: { ...state, players: state.players.map((p) => walk(state.arena, p, dt)) },
  events: [],
});
