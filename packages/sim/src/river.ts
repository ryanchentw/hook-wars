import { PICKUP_KINDS, PICKUPS } from './config';
import { nextRandom } from './rng';
import type { Arena, GameState, Hook, Pickup, PickupId, PickupKind, RiverEnd, Rng } from './types';
import type { Stage } from './world';

/** Summed float time lands a hair either side of a due time, so a spawn due now is not put off a tick. */
const SLACK = 1e-6;

/** Everything that decides one pickup's run down the water. */
export type PickupSpawn = { readonly kind: PickupKind; readonly from: RiverEnd; readonly lane: number };

/** The x range a lane is picked from: the canal less a pickup's width and margin at each bank. */
function laneRange(arena: Arena): { readonly x0: number; readonly x1: number } {
  const inset = PICKUPS.radius + PICKUPS.laneMargin;
  return { x0: arena.canal.x0 + inset, x1: arena.canal.x1 - inset };
}

/** Where a pickup in `lane` floats at height `y`: in its lane, pushed sideways around the buoy as water would carry it. */
export function driftX(arena: Arena, lane: number, y: number): number {
  const { pos, radius } = arena.buoy;
  const clear = radius + PICKUPS.radius + PICKUPS.laneMargin;
  const dy = y - pos.y;
  if (Math.abs(dy) >= clear) return lane;
  const side = lane < pos.x ? -1 : 1;
  const edge = pos.x + side * Math.sqrt(clear * clear - dy * dy);
  return side < 0 ? Math.min(lane, edge) : Math.max(lane, edge);
}

const entryY = (arena: Arena, from: RiverEnd): number => (from === 'north' ? -PICKUPS.radius : arena.height + PICKUPS.radius);
const heading = (from: RiverEnd): number => (from === 'north' ? 1 : -1);

/** Puts a pickup on the water at the end it enters from. The one way a pickup appears, scheduled or forced by a test. */
export function spawnPickup(state: GameState, spawn: PickupSpawn): GameState {
  const y = entryY(state.arena, spawn.from);
  const pickup: Pickup = {
    id: `p${state.nextPickupSeq}` as PickupId,
    kind: spawn.kind,
    pos: { x: driftX(state.arena, spawn.lane, y), y },
    from: spawn.from,
    lane: spawn.lane,
    state: { kind: 'drifting' },
  };
  return { ...state, nextPickupSeq: state.nextPickupSeq + 1, pickups: [...state.pickups, pickup] };
}

/** Which end, which kind, which lane: three draws from the river's own stream. */
export function rollSpawn(arena: Arena, rng: Rng): { readonly spawn: PickupSpawn; readonly rng: Rng } {
  const [end, afterEnd] = nextRandom(rng);
  const [kind, afterKind] = nextRandom(afterEnd);
  const [lane, afterLane] = nextRandom(afterKind);
  const range = laneRange(arena);
  const spawn: PickupSpawn = {
    from: end < 0.5 ? 'north' : 'south',
    kind: PICKUP_KINDS[Math.floor(kind * PICKUP_KINDS.length)] ?? 'gold',
    lane: range.x0 + lane * (range.x1 - range.x0),
  };
  return { spawn, rng: afterLane };
}

/** A drifting pickup one step on, or nothing once it has floated out past the far end. */
function drift(arena: Arena, p: Pickup, dt: number): readonly Pickup[] {
  if (p.state.kind !== 'drifting') return [p];
  const y = p.pos.y + heading(p.from) * PICKUPS.driftSpeed * dt;
  const gone = p.from === 'north' ? y > arena.height + PICKUPS.radius : y < -PICKUPS.radius;
  return gone ? [] : [{ ...p, pos: { x: driftX(arena, p.lane, y), y } }];
}

/** A carried pickup goes down with its hook, and with a hook whose thrower has died: it never reaches a hand. */
function sunk(state: GameState, p: Pickup): boolean {
  if (p.state.kind !== 'carried') return false;
  const { hookId } = p.state;
  const hook = state.hooks.find((h) => h.id === hookId);
  const owner = hook && state.players.find((q) => q.id === hook.ownerId);
  return !owner || owner.status.kind === 'dead';
}

function letGo(hook: Hook, gone: ReadonlySet<string>): Hook {
  const { phase } = hook;
  const lost = phase.kind === 'retracting' && phase.cargo?.kind === 'pickup' && gone.has(phase.cargo.id);
  return lost ? { ...hook, phase: { kind: 'retracting', cargo: null } } : hook;
}

function sink(state: GameState): GameState {
  const gone = new Set<string>(state.pickups.filter((p) => sunk(state, p)).map((p) => p.id));
  if (gone.size === 0) return state;
  return { ...state, pickups: state.pickups.filter((p) => !gone.has(p.id)), hooks: state.hooks.map((h) => letGo(h, gone)) };
}

function sendNext(state: GameState, t: number): GameState {
  const { river } = state;
  if (river === null || t + SLACK < river.nextAt) return state;
  const rolled = rollSpawn(state.arena, river.rng);
  return { ...spawnPickup(state, rolled.spawn), river: { rng: rolled.rng, nextAt: river.nextAt + PICKUPS.interval } };
}

/** Sinks what can no longer reach a hand, floats the rest on, then sends the next pickup when one is due. */
export const advanceRiver: Stage = (state, { t, dt }) => {
  const kept = sink(state);
  const drifted = { ...kept, pickups: kept.pickups.flatMap((p) => drift(state.arena, p, dt)) };
  return { state: sendNext(drifted, t), events: [] };
};
