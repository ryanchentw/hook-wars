import { TUNING } from './config';
import { length, normalize, scale, sub } from './geometry';
import type { MoveIntent, Vec2 } from './types';

export const IDLE: MoveIntent = { kind: 'idle' };

/** The client's direction is untrusted: only its heading counts, so a long vector cannot buy speed. */
export function steerIntent(dir: Vec2): MoveIntent {
  const len = length(dir);
  if (!Number.isFinite(len) || len === 0) return IDLE;
  return { kind: 'steer', dir: normalize(dir) };
}

/**
 * Being latched, dying or respawning ends a walk to a point, but a held key is still held,
 * so a steering player walks again the moment they are free.
 */
export function interrupt(move: MoveIntent): MoveIntent {
  return move.kind === 'toward' ? IDLE : move;
}

export function velocity(move: MoveIntent, pos: Vec2): Vec2 {
  switch (move.kind) {
    case 'idle':
      return { x: 0, y: 0 };
    case 'toward':
      return scale(normalize(sub(move.target, pos)), TUNING.moveSpeed);
    case 'steer':
      return scale(move.dir, TUNING.moveSpeed);
  }
}
