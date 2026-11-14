import { clampToNearestDock } from './arena';
import { TUNING } from './config';
import { logDamage } from './economy';
import { along, distance, normalize, sub } from './geometry';
import { endGrapple } from './grapple';
import { firstPlayer, fly } from './hookFlight';
import { interrupt } from './intent';
import type { GameEvent, GameState, Hook, Player, Vec2 } from './types';
import { findPlayer, setDown, replaceHook, updatePlayer, type Outcome, type Stage, type StepContext } from './world';

/** Below this the hook has spent its range; float residue must not keep it extending. */
const SPENT = 1e-9;

/** `hook` has already moved to where it met `target`. The one way a hook takes a player, out or back. */
function latch(state: GameState, hook: Hook, owner: Player, target: Player, t: number): Outcome {
  const ally = target.team === owner.team;
  const damage = ally ? 0 : hook.stats.damage;
  const hit: GameEvent = { kind: 'hookHit', hookId: hook.id, ownerId: owner.id, targetId: target.id, damage, ally, at: hook.pos };
  const latched = updatePlayer(endGrapple(state, target.id, t), target.id, (p) => ({
    ...(ally ? p : logDamage(p, owner.id, t)),
    hp: p.hp - damage,
    status: { kind: 'dragged', hookId: hook.id },
    move: interrupt(p.move),
  }));
  return { state: replaceHook(latched, hook.id, { ...hook, phase: { kind: 'retracting', cargo: target.id } }), events: [hit] };
}

function extend(state: GameState, hook: Hook, remaining: number, ctx: StepContext): Outcome {
  const flight = fly(state, hook, remaining, hook.stats.speed * ctx.dt);
  const bounces: GameEvent[] = flight.bounces.map((at) => ({ kind: 'hookBounce', hookId: hook.id, at }));
  const moved: Hook = { ...hook, pos: flight.pos, dir: flight.dir, path: flight.path };
  const owner = findPlayer(state, hook.ownerId);
  const target = flight.hit === null ? undefined : findPlayer(state, flight.hit);
  if (!target || !owner) {
    const phase = flight.remaining <= SPENT
      ? { kind: 'retracting' as const, cargo: null }
      : { kind: 'extending' as const, remaining: flight.remaining };
    return { state: replaceHook(state, hook.id, { ...moved, phase }), events: bounces };
  }
  const caught = latch(state, moved, owner, target, ctx.t);
  return { state: caught.state, events: [...bounces, ...caught.events] };
}

function release(cargo: Player, hook: Hook, state: GameState, at: Vec2, t: number): Player {
  const draggedHere = cargo.status.kind === 'dragged' && cargo.status.hookId === hook.id;
  return draggedHere ? setDown({ ...cargo, pos: clampToNearestDock(state.arena, at) }, t) : cargo;
}

function land(state: GameState, hook: Hook, owner: Player, cargo: Player['id'] | null, at: Vec2, t: number): GameState {
  const caught = cargo === null ? undefined : findPlayer(state, cargo);
  // Landing a catch must always pay off, so the thrower's swing is ready however recently they last swung.
  const swingNow = caught !== undefined && caught.team !== owner.team;
  const ready = updatePlayer(replaceHook(state, hook.id, null), owner.id, (p) => ({
    ...p,
    hookReadyAt: t + TUNING.hookCooldown,
    meleeReadyAt: swingNow ? Math.min(p.meleeReadyAt, t) : p.meleeReadyAt,
  }));
  return cargo === null ? ready : updatePlayer(ready, cargo, (p) => release(p, hook, ready, at, t));
}

/** A barb on its way back passes over the owner's team: dragging an ally who stands nearby would punish the buyer. */
function snag(state: GameState, hook: Hook, owner: Player, dir: Vec2, travel: number, t: number): Outcome | null {
  const met = firstPlayer(state.players.filter((p) => p.team !== owner.team), hook, hook.pos, dir, travel);
  const target = met === null ? undefined : findPlayer(state, met.id);
  return met && target ? latch(state, { ...hook, pos: along(hook.pos, dir, met.t) }, owner, target, t) : null;
}

function retract(state: GameState, hook: Hook, cargo: Player['id'] | null, ctx: StepContext): Outcome {
  const owner = findPlayer(state, hook.ownerId);
  if (!owner) return { state: replaceHook(state, hook.id, null), events: [] };
  const dir = normalize(sub(owner.pos, hook.pos));
  const gap = distance(hook.pos, owner.pos);
  const reach = TUNING.playerRadius + hook.stats.radius;
  const stride = hook.stats.retractSpeed * ctx.dt;
  const arriving = gap - stride <= reach;
  const travel = arriving ? Math.max(0, gap - reach) : stride;
  const pos = along(hook.pos, dir, travel);
  const caught = cargo === null && hook.stats.barbed ? snag(state, hook, owner, dir, travel, ctx.t) : null;
  if (caught) return caught;
  if (!arriving) {
    const moved = replaceHook(state, hook.id, { ...hook, pos });
    return { state: cargo === null ? moved : updatePlayer(moved, cargo, (p) => ({ ...p, pos })), events: [] };
  }
  return { state: land(state, hook, owner, cargo, pos, ctx.t), events: [] };
}

function advance(state: GameState, hook: Hook, ctx: StepContext): Outcome {
  switch (hook.phase.kind) {
    case 'extending':
      return extend(state, hook, hook.phase.remaining, ctx);
    case 'retracting':
      return retract(state, hook, hook.phase.cargo, ctx);
  }
}

export const advanceHooks: Stage = (state, ctx) =>
  state.hooks.reduce<Outcome>(
    (acc, hook) => {
      const next = advance(acc.state, hook, ctx);
      return { state: next.state, events: [...acc.events, ...next.events] };
    },
    { state, events: [] },
  );
