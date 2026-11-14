import { clampToNearestDock } from './arena';
import { GRAPPLE, ITEMS, TUNING } from './config';
import { along, distance, normalize, sub } from './geometry';
import { interrupt } from './intent';
import type { Arena, GameEvent, GameState, Grapple, GrappleId, Player, PlayerId, Vec2 } from './types';
import { findPlayer, isAlive, landed, ownsHook, updatePlayer, type Outcome, type Stage, type StepContext } from './world';

/** Alive, owns a grapple that is off cooldown. A grappling player is not alive, so this also rules out a second grapple. */
export function grappleReady(player: Player, t: number): boolean {
  const item = player.items.grapple;
  return isAlive(player) && item.kind === 'owned' && t >= item.readyAt;
}

function anchorFor(arena: Arena, from: Vec2, target: Vec2): Vec2 {
  const reach = Math.min(GRAPPLE.range, distance(from, target));
  return clampToNearestDock(arena, along(from, normalize(sub(target, from)), reach));
}

export function castGrapple(state: GameState, player: Player, target: Vec2, t: number): Outcome {
  const none = { state, events: [] };
  if (!grappleReady(player, t) || ownsHook(state, player.id)) return none;
  const anchor = anchorFor(state.arena, player.pos, target);
  if (distance(anchor, player.pos) <= TUNING.bodySpacing) return none;
  const id = `g${state.nextGrappleSeq}` as GrappleId;
  const dir = sub(anchor, player.pos);
  const withGrapple: GameState = {
    ...state,
    nextGrappleSeq: state.nextGrappleSeq + 1,
    grapples: [...state.grapples, { id, ownerId: player.id, pos: player.pos, anchor, phase: { kind: 'flying' } }],
  };
  return {
    state: updatePlayer(withGrapple, player.id, (p) => ({
      ...p,
      status: { kind: 'grappling', grappleId: id },
      move: interrupt(p.move),
      facing: Math.atan2(dir.y, dir.x),
    })),
    events: [{ kind: 'grappleCast', grappleId: id, ownerId: player.id }],
  };
}

const startCooldown = (p: Player, t: number): Player => ({
  ...p,
  items: { ...p.items, grapple: { kind: 'owned', readyAt: t + ITEMS.grapple.cooldown } },
});

function withoutGrapple(state: GameState, id: GrappleId): GameState {
  return { ...state, grapples: state.grapples.filter((g) => g.id !== id) };
}

/** Removes the player's grapple and starts its cooldown. The caller sets the status the interruption leaves them in. */
export function endGrapple(state: GameState, playerId: PlayerId, t: number): GameState {
  const grapple = state.grapples.find((g) => g.ownerId === playerId);
  if (!grapple) return state;
  return updatePlayer(withoutGrapple(state, grapple.id), playerId, (p) => startCooldown(p, t));
}

function fly(state: GameState, g: Grapple, dt: number): Outcome {
  const stride = GRAPPLE.flightSpeed * dt;
  const landed = distance(g.pos, g.anchor) <= stride;
  const next: Grapple = landed
    ? { ...g, pos: g.anchor, phase: { kind: 'pulling' } }
    : { ...g, pos: along(g.pos, normalize(sub(g.anchor, g.pos)), stride) };
  const grapples = state.grapples.map((x) => (x.id === g.id ? next : x));
  const events: GameEvent[] = landed ? [{ kind: 'grappleLand', grappleId: g.id, at: g.anchor }] : [];
  return { state: { ...state, grapples }, events };
}

function pull(state: GameState, g: Grapple, owner: Player, ctx: StepContext): Outcome {
  const stride = GRAPPLE.pullSpeed * ctx.dt;
  if (distance(owner.pos, g.anchor) > stride) {
    const pos = along(owner.pos, normalize(sub(g.anchor, owner.pos)), stride);
    return { state: updatePlayer(state, owner.id, (p) => ({ ...p, pos })), events: [] };
  }
  const arrived = updatePlayer(withoutGrapple(state, g.id), owner.id, (p) =>
    startCooldown(landed({ ...p, pos: g.anchor }, ctx.t), ctx.t),
  );
  return { state: arrived, events: [{ kind: 'grappleArrive', playerId: owner.id, at: g.anchor }] };
}

function advance(state: GameState, g: Grapple, ctx: StepContext): Outcome {
  const owner = findPlayer(state, g.ownerId);
  if (!owner) return { state: withoutGrapple(state, g.id), events: [] };
  switch (g.phase.kind) {
    case 'flying':
      return fly(state, g, ctx.dt);
    case 'pulling':
      return pull(state, g, owner, ctx);
  }
}

export const advanceGrapples: Stage = (state, ctx) =>
  state.grapples.reduce<Outcome>(
    (acc, g) => {
      const next = advance(acc.state, g, ctx);
      return { state: next.state, events: [...acc.events, ...next.events] };
    },
    { state, events: [] },
  );
