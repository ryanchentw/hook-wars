import { clampToDock, dockAt } from './arena';
import { TUNING } from './config';
import { add, distance, scale, sub } from './geometry';
import type { Arena, Player } from './types';
import type { Stage } from './world';

const BODY = TUNING.bodySpacing;

const solid = (p: Player): boolean => p.status.kind !== 'dead';
/** A dragged or grappling player is carried by a line, so only a free player gives way. */
const yields = (p: Player): boolean => p.status.kind === 'alive' || p.status.kind === 'staggered';

function nudge(arena: Arena, p: Player, by: { readonly x: number; readonly y: number }): Player {
  return { ...p, pos: clampToDock(arena, add(p.pos, by), dockAt(arena, p.pos)) };
}

function separatePair(arena: Arena, a: Player, b: Player): readonly [Player, Player] {
  const yielding = [a, b].filter(yields).length;
  if (!solid(a) || !solid(b) || yielding === 0) return [a, b];
  const gap = distance(a.pos, b.pos);
  if (gap >= BODY) return [a, b];
  // Bodies on the exact same spot have no line to part along; a fixed axis keeps the step deterministic.
  const axis = gap > 0 ? scale(sub(b.pos, a.pos), 1 / gap) : { x: 1, y: 0 };
  const share = (BODY - gap) / yielding;
  return [
    yields(a) ? nudge(arena, a, scale(axis, -share)) : a,
    yields(b) ? nudge(arena, b, scale(axis, share)) : b,
  ];
}

export const separatePlayers: Stage = (state) => {
  const pairs = state.players.flatMap((_, i) => state.players.slice(i + 1).map((__, k) => [i, i + 1 + k] as const));
  const players = pairs.reduce<readonly Player[]>((acc, [i, j]) => {
    const a = acc[i];
    const b = acc[j];
    if (!a || !b) return acc;
    const [nextA, nextB] = separatePair(state.arena, a, b);
    return nextA === a && nextB === b ? acc : acc.map((p, k) => (k === i ? nextA : k === j ? nextB : p));
  }, state.players);
  return { state: players === state.players ? state : { ...state, players }, events: [] };
};
