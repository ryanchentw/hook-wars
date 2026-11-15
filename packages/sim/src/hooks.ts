import { clampToNearestDock } from './arena';
import { TUNING } from './config';
import { logDamage } from './economy';
import { along, distance, normalize, sub } from './geometry';
import { endGrapple } from './grapple';
import { collect } from './collect';
import { firstCatch, fly } from './hookFlight';
import { interrupt } from './intent';
import type { Cargo, GameEvent, GameState, Hook, Pickup, Player, Vec2 } from './types';
import { findPickup, findPlayer, setDown, replaceHook, updatePlayer, type Outcome, type Stage, type StepContext } from './world';

/** Below this the hook has spent its range; float residue must not keep it extending. */
const SPENT = 1e-9;

/** `hook` has already moved to where it met `target`. The one way a hook takes a fighter, out or back. */
function latchFighter(state: GameState, hook: Hook, owner: Player, target: Player, t: number): Outcome {
  const ally = target.team === owner.team;
  const damage = ally ? 0 : hook.stats.damage;
  const hit: GameEvent = { kind: 'hookHit', hookId: hook.id, ownerId: owner.id, targetId: target.id, damage, ally, at: hook.pos };
  const latched = updatePlayer(endGrapple(state, target.id, t), target.id, (p) => ({
    ...(ally ? p : logDamage(p, owner.id, t)),
    hp: p.hp - damage,
    status: { kind: 'dragged', hookId: hook.id },
    move: interrupt(p.move),
  }));
  return { state: replaceHook(latched, hook.id, { ...hook, phase: { kind: 'retracting', cargo: { kind: 'fighter', id: target.id } } }), events: [hit] };
}

/** The one way a hook takes a pickup: off the water, or off whichever hook was carrying it, which goes home empty. */
function latchPickup(state: GameState, hook: Hook, owner: Player, pickup: Pickup): Outcome {
  const carrier = pickup.state.kind === 'carried' ? pickup.state.hookId : null;
  const robbed = state.hooks.find((h) => h.id === carrier);
  const freed = robbed ? replaceHook(state, robbed.id, { ...robbed, phase: { kind: 'retracting', cargo: null } }) : state;
  const carried: Pickup = { ...pickup, pos: hook.pos, state: { kind: 'carried', hookId: hook.id } };
  const withPickup = { ...freed, pickups: freed.pickups.map((p) => (p.id === pickup.id ? carried : p)) };
  const caught: GameEvent = { kind: 'pickupCaught', pickupId: pickup.id, pickupKind: pickup.kind, hookId: hook.id, ownerId: owner.id, at: hook.pos };
  return { state: replaceHook(withPickup, hook.id, { ...hook, phase: { kind: 'retracting', cargo: { kind: 'pickup', id: pickup.id } } }), events: [caught] };
}

function latch(state: GameState, hook: Hook, owner: Player, cargo: Cargo, t: number): Outcome | null {
  if (cargo.kind === 'fighter') {
    const target = findPlayer(state, cargo.id);
    return target ? latchFighter(state, hook, owner, target, t) : null;
  }
  const pickup = findPickup(state, cargo.id);
  return pickup ? latchPickup(state, hook, owner, pickup) : null;
}

function extend(state: GameState, hook: Hook, remaining: number, ctx: StepContext): Outcome {
  const flight = fly(state, hook, remaining, hook.stats.speed * ctx.dt);
  const bounces: GameEvent[] = flight.bounces.map((at) => ({ kind: 'hookBounce', hookId: hook.id, at }));
  const moved: Hook = { ...hook, pos: flight.pos, dir: flight.dir, path: flight.path };
  const owner = findPlayer(state, hook.ownerId);
  const caught = owner && flight.hit ? latch(state, moved, owner, flight.hit, ctx.t) : null;
  if (!caught) {
    const phase = flight.remaining <= SPENT
      ? { kind: 'retracting' as const, cargo: null }
      : { kind: 'extending' as const, remaining: flight.remaining };
    return { state: replaceHook(state, hook.id, { ...moved, phase }), events: bounces };
  }
  return { state: caught.state, events: [...bounces, ...caught.events] };
}

function release(cargo: Player, hook: Hook, state: GameState, at: Vec2, t: number): Player {
  const draggedHere = cargo.status.kind === 'dragged' && cargo.status.hookId === hook.id;
  return draggedHere ? setDown({ ...cargo, pos: clampToNearestDock(state.arena, at) }, t) : cargo;
}

function land(state: GameState, hook: Hook, owner: Player, cargo: Cargo | null, at: Vec2, t: number): Outcome {
  const caught = cargo?.kind === 'fighter' ? findPlayer(state, cargo.id) : undefined;
  // Landing a catch must always pay off, so the thrower's swing is ready however recently they last swung.
  const swingNow = caught !== undefined && caught.team !== owner.team;
  const ready = updatePlayer(replaceHook(state, hook.id, null), owner.id, (p) => ({
    ...p,
    hookReadyAt: t + TUNING.hookCooldown,
    meleeReadyAt: swingNow ? Math.min(p.meleeReadyAt, t) : p.meleeReadyAt,
  }));
  if (cargo === null) return { state: ready, events: [] };
  if (cargo.kind === 'fighter') return { state: updatePlayer(ready, cargo.id, (p) => release(p, hook, ready, at, t)), events: [] };
  const pickup = findPickup(ready, cargo.id);
  return pickup ? collect(ready, pickup, owner, t) : { state: ready, events: [] };
}

/** A barb on its way back passes over the owner's team: dragging an ally who stands nearby would punish the buyer. */
function snag(state: GameState, hook: Hook, owner: Player, dir: Vec2, travel: number, t: number): Outcome | null {
  const enemies = state.players.filter((p) => p.team !== owner.team);
  const met = firstCatch(enemies, state.pickups, hook, hook.pos, dir, travel);
  return met ? latch(state, { ...hook, pos: along(hook.pos, dir, met.t) }, owner, met.cargo, t) : null;
}

/** The cargo rides at the hook head. */
function haul(state: GameState, cargo: Cargo, pos: Vec2): GameState {
  if (cargo.kind === 'fighter') return updatePlayer(state, cargo.id, (p) => ({ ...p, pos }));
  return { ...state, pickups: state.pickups.map((p) => (p.id === cargo.id ? { ...p, pos } : p)) };
}

function retract(state: GameState, hook: Hook, cargo: Cargo | null, ctx: StepContext): Outcome {
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
    return { state: cargo === null ? moved : haul(moved, cargo, pos), events: [] };
  }
  return land(state, hook, owner, cargo, pos, ctx.t);
}

function advance(state: GameState, hook: Hook, ctx: StepContext): Outcome {
  switch (hook.phase.kind) {
    case 'extending':
      return extend(state, hook, hook.phase.remaining, ctx);
    case 'retracting':
      return retract(state, hook, hook.phase.cargo, ctx);
  }
}

/** Each hook is read afresh, since one taking a pickup off another changes the other before its turn. */
export const advanceHooks: Stage = (state, ctx) =>
  state.hooks.reduce<Outcome>(
    (acc, { id }) => {
      const hook = acc.state.hooks.find((h) => h.id === id);
      if (!hook) return acc;
      const next = advance(acc.state, hook, ctx);
      return { state: next.state, events: [...acc.events, ...next.events] };
    },
    { state, events: [] },
  );
