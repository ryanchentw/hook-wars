import { TUNING } from './config';
import { along, dot, normalize, reflect, sub, sweepCircle } from './geometry';
import type { Arena, GameState, Hook, Player, PlayerId, Vec2 } from './types';

/** Caps bounces in one step so a hook wedged in a corner cannot loop forever. */
const MAX_BOUNCES_PER_STEP = 8;

export type Flight = {
  readonly pos: Vec2;
  readonly dir: Vec2;
  readonly remaining: number;
  readonly path: readonly Vec2[];
  readonly bounces: readonly Vec2[];
  readonly hit: PlayerId | null;
};

type Surface = { readonly t: number; readonly normal: Vec2 };

/** `m` is the hook radius: the centre turns back that far from each wall. */
function wallHit(arena: Arena, p: Vec2, dir: Vec2, m: number): Surface | null {
  const walls: (Surface | null)[] = [
    dir.x < 0 ? { t: (m - p.x) / dir.x, normal: { x: 1, y: 0 } } : null,
    dir.x > 0 ? { t: (arena.width - m - p.x) / dir.x, normal: { x: -1, y: 0 } } : null,
    dir.y < 0 ? { t: (m - p.y) / dir.y, normal: { x: 0, y: 1 } } : null,
    dir.y > 0 ? { t: (arena.height - m - p.y) / dir.y, normal: { x: 0, y: -1 } } : null,
  ];
  return nearest(walls.map((w) => (w ? { ...w, t: Math.max(0, w.t) } : null)));
}

function buoyHit(arena: Arena, p: Vec2, dir: Vec2, maxT: number, hookRadius: number): Surface | null {
  const { pos: center, radius } = arena.buoy;
  // A hook just reflected off the buoy sits on its surface; only an approaching hook can hit it.
  if (dot(dir, sub(p, center)) >= 0) return null;
  const t = sweepCircle(p, dir, maxT, center, radius + hookRadius);
  return t === null ? null : { t, normal: normalize(sub(along(p, dir, t), center)) };
}

function nearest<T extends { readonly t: number }>(items: readonly (T | null)[]): T | null {
  return items.reduce<T | null>((best, item) => (item && (!best || item.t < best.t) ? item : best), null);
}

function firstSurface(arena: Arena, p: Vec2, dir: Vec2, maxT: number, hookRadius: number): Surface | null {
  const hit = nearest([wallHit(arena, p, dir, hookRadius), buoyHit(arena, p, dir, maxT, hookRadius)]);
  return hit && hit.t <= maxT ? hit : null;
}

/** Only a player standing or grappling can be latched; a dragged player already rides a hook. */
const HOOKABLE: ReadonlySet<Player['status']['kind']> = new Set(['alive', 'grappling', 'staggered']);
const hookable = (p: Player): boolean => HOOKABLE.has(p.status.kind);

function firstPlayer(state: GameState, hook: Hook, p: Vec2, dir: Vec2, maxT: number) {
  const reach = TUNING.playerRadius + hook.stats.radius;
  return nearest(
    state.players
      .filter((q) => q.id !== hook.ownerId && hookable(q))
      .map((q) => {
        const t = sweepCircle(p, dir, maxT, q.pos, reach);
        return t === null ? null : { t, id: q.id };
      }),
  );
}

/** Moves an extending hook up to `travel` along its bouncing path, stopping at the first player it reaches. */
export function fly(state: GameState, hook: Hook, remaining: number, travel: number): Flight {
  let flight: Flight = { pos: hook.pos, dir: hook.dir, remaining, path: hook.path, bounces: [], hit: null };
  let left = Math.min(travel, remaining);
  for (let i = 0; i <= MAX_BOUNCES_PER_STEP && left > 0; i++) {
    const surface = firstSurface(state.arena, flight.pos, flight.dir, left, hook.stats.radius);
    const target = firstPlayer(state, hook, flight.pos, flight.dir, surface ? surface.t : left);
    if (target) {
      return { ...flight, pos: along(flight.pos, flight.dir, target.t), remaining: flight.remaining - target.t, hit: target.id };
    }
    if (!surface) {
      return { ...flight, pos: along(flight.pos, flight.dir, left), remaining: flight.remaining - left };
    }
    const at = along(flight.pos, flight.dir, surface.t);
    flight = {
      ...flight,
      pos: at,
      dir: reflect(flight.dir, surface.normal),
      remaining: flight.remaining - surface.t,
      path: [...flight.path, at],
      bounces: [...flight.bounces, at],
    };
    left -= surface.t;
  }
  return flight;
}
