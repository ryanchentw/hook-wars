import { steerIntent, TICK_DT, walkPlayer, type Arena, type SeenPlayer, type Vec2 } from '@hookbrawl/sim';

/** One tick of the local player's held direction, sent to the server and not yet acknowledged. */
export type PendingInput = { readonly seq: number; readonly steer: Vec2 };

/** Walking is predicted and nothing else is: a fighter being dragged, hauled, staggered or dead goes where the server says. */
export const isPredictable = (player: SeenPlayer): boolean => player.status.kind === 'alive';

/**
 * The local fighter one tick on, holding `steer`: the same walk the server will run when it applies this input.
 * A client always knows its own gold, so the view's fighter is a whole sim fighter here.
 */
export function walkAhead(player: SeenPlayer, steer: Vec2, arena: Arena): SeenPlayer {
  if (!isPredictable(player)) return player;
  return walkPlayer(arena, { ...player, gold: player.gold ?? 0, move: steerIntent(steer) }, TICK_DT);
}

export type Reconciled = { readonly player: SeenPlayer; readonly pending: readonly PendingInput[] };

/**
 * Where the local fighter is now, given where the server last had them. The server's word replaces everything up to
 * `ack`; the inputs it has not applied yet are walked again on top, in order. Nothing is predicted for a fighter who
 * cannot walk, but their unacknowledged inputs are kept for when they can.
 */
export function reconcile(server: SeenPlayer, ack: number, pending: readonly PendingInput[], arena: Arena): Reconciled {
  const unacked = pending.filter((input) => input.seq > ack);
  return { player: unacked.reduce((player, input) => walkAhead(player, input.steer, arena), server), pending: unacked };
}

/** A new offset after the fighter's true place moved from `before` to `after`: what is drawn stays put, and the error is left to decay. */
export function absorbCorrection(offset: Vec2, before: Vec2, after: Vec2, snapDistance: number): Vec2 {
  const next = { x: offset.x + before.x - after.x, y: offset.y + before.y - after.y };
  return Math.hypot(next.x, next.y) > snapDistance ? { x: 0, y: 0 } : next;
}

export function decayCorrection(offset: Vec2, dt: number, halfLife: number): Vec2 {
  const keep = 0.5 ** (dt / halfLife);
  return { x: offset.x * keep, y: offset.y * keep };
}
