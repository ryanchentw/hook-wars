import { clampToNearestDock } from './arena';
import { TUNING } from './config';
import { logDamage } from './economy';
import { along, distance, normalize, sub } from './geometry';
import { endGrapple } from './grapple';
import { fly } from './hookFlight';
import { interrupt } from './intent';
import type { GameEvent, GameState, Hook, Player, Vec2 } from './types';
import { findPlayer, replaceHook, updatePlayer, type Outcome, type Stage, type StepContext } from './world';

/** Below this the hook has spent its range; float residue must not keep it extending. */
const SPENT = 1e-9;

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
  const ally = target.team === owner.team;
  const damage = ally ? 0 : hook.stats.damage;
  const hit: GameEvent = { kind: 'hookHit', hookId: hook.id, ownerId: owner.id, targetId: target.id, damage, ally, at: flight.pos };
  const latched = updatePlayer(endGrapple(state, target.id, ctx.t), target.id, (p) => ({
    ...(ally ? p : logDamage(p, owner.id, ctx.t)),
    hp: p.hp - damage,
    status: { kind: 'dragged', hookId: hook.id },
    move: interrupt(p.move),
  }));
  return {
    state: replaceHook(latched, hook.id, { ...moved, phase: { kind: 'retracting', cargo: target.id } }),
    events: [...bounces, hit],
  };
}

function release(cargo: Player, hook: Hook, state: GameState, at: Vec2): Player {
  const draggedHere = cargo.status.kind === 'dragged' && cargo.status.hookId === hook.id;
  return draggedHere ? { ...cargo, status: { kind: 'alive' }, pos: clampToNearestDock(state.arena, at) } : cargo;
}

function retract(state: GameState, hook: Hook, cargo: Player['id'] | null, ctx: StepContext): GameState {
  const owner = findPlayer(state, hook.ownerId);
  if (!owner) return replaceHook(state, hook.id, null);
  const gap = distance(hook.pos, owner.pos);
  const stride = hook.stats.retractSpeed * ctx.dt;
  const reach = TUNING.playerRadius + hook.stats.radius;
  if (gap - stride > reach) {
    const pos = along(hook.pos, normalize(sub(owner.pos, hook.pos)), stride);
    const moved = replaceHook(state, hook.id, { ...hook, pos });
    return cargo === null ? moved : updatePlayer(moved, cargo, (p) => ({ ...p, pos }));
  }
  const at = gap > reach ? along(owner.pos, normalize(sub(hook.pos, owner.pos)), reach) : hook.pos;
  const ready = updatePlayer(replaceHook(state, hook.id, null), owner.id, (p) => ({
    ...p,
    hookReadyAt: ctx.t + TUNING.hookCooldown,
  }));
  return cargo === null ? ready : updatePlayer(ready, cargo, (p) => release(p, hook, ready, at));
}

function advance(state: GameState, hook: Hook, ctx: StepContext): Outcome {
  switch (hook.phase.kind) {
    case 'extending':
      return extend(state, hook, hook.phase.remaining, ctx);
    case 'retracting':
      return { state: retract(state, hook, hook.phase.cargo, ctx), events: [] };
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
