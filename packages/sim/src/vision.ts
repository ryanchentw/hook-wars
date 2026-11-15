import { distance, sub } from './geometry';
import type { GameState, Grapple, GrappleId, Hook, HookId, Pickup, PickupId, Player, PlayerId, TeamId, Vec2 } from './types';

/** Where a team can see: everywhere, or inside any of its living fighters' circles. */
export type SightArea =
  | { readonly kind: 'everywhere' }
  | { readonly kind: 'circles'; readonly centres: readonly Vec2[]; readonly radius: number };

/** What one team may see of the match right now. */
export type Sight = {
  readonly viewer: TeamId;
  readonly area: SightArea;
  readonly players: ReadonlySet<PlayerId>;
  readonly hooks: ReadonlySet<HookId>;
  readonly grapples: ReadonlySet<GrappleId>;
  readonly pickups: ReadonlySet<PickupId>;
};

/** Steps of the search for where a line leaves sight; each halves the error, so 24 is far below a sim unit. */
const EDGE_STEPS = 24;

export function seesPoint(area: SightArea, p: Vec2): boolean {
  return area.kind === 'everywhere' || area.centres.some((c) => distance(c, p) <= area.radius);
}

function areaOf(state: GameState, team: TeamId): SightArea {
  if (state.vision.kind === 'open') return { kind: 'everywhere' };
  const centres = state.players.filter((p) => p.team === team && p.status.kind !== 'dead').map((p) => p.pos);
  return { kind: 'circles', centres, radius: state.vision.radius };
}

/** Someone on a chain is seen by everyone for the whole drag, so a chain never hauls empty air. */
function seesPlayer(area: SightArea, team: TeamId, p: Player): boolean {
  return p.team === team || p.status.kind === 'dragged' || seesPoint(area, p.pos);
}

/** The hook is seen where its head is; a hook that carries a fighter is at them, and they are seen. */
function seesHook(area: SightArea, team: TeamId, owners: ReadonlyMap<PlayerId, TeamId>, hook: Hook): boolean {
  if (owners.get(hook.ownerId) === team) return true;
  return (hook.phase.kind === 'retracting' && hook.phase.cargo?.kind === 'fighter') || seesPoint(area, hook.pos);
}

/** Seen like an enemy hook head: where it floats, or on a hook the team sees. */
function seesPickup(area: SightArea, hooks: ReadonlySet<HookId>, pickup: Pickup): boolean {
  return pickup.state.kind === 'carried' ? hooks.has(pickup.state.hookId) : seesPoint(area, pickup.pos);
}

function seesGrapple(area: SightArea, team: TeamId, owners: ReadonlyMap<PlayerId, TeamId>, grapple: Grapple): boolean {
  return owners.get(grapple.ownerId) === team || seesPoint(area, grapple.pos);
}

/** Which players, hook heads, grapple heads and pickups `team` may see. A dead fighter gives no vision. */
export function visibleTo(state: GameState, team: TeamId): Sight {
  const area = areaOf(state, team);
  const owners = new Map(state.players.map((p) => [p.id, p.team]));
  const hooks = new Set(state.hooks.filter((h) => seesHook(area, team, owners, h)).map((h) => h.id));
  return {
    viewer: team,
    area,
    players: new Set(state.players.filter((p) => seesPlayer(area, team, p)).map((p) => p.id)),
    hooks,
    grapples: new Set(state.grapples.filter((g) => seesGrapple(area, team, owners, g)).map((g) => g.id)),
    pickups: new Set(state.pickups.filter((p) => seesPickup(area, hooks, p)).map((p) => p.id)),
  };
}

/** The point between `seen` and `unseen` where the line from one to the other leaves sight. */
function edgeBetween(area: SightArea, seen: Vec2, unseen: Vec2): Vec2 {
  const delta = sub(unseen, seen);
  let [lo, hi] = [0, 1];
  for (let i = 0; i < EDGE_STEPS; i += 1) {
    const mid = (lo + hi) / 2;
    if (seesPoint(area, { x: seen.x + delta.x * mid, y: seen.y + delta.y * mid })) lo = mid;
    else hi = mid;
  }
  return { x: seen.x + delta.x * lo, y: seen.y + delta.y * lo };
}

/**
 * The end of a polyline that lies in sight, walking back from its last point until the line first leaves sight.
 * Empty when the last point itself is out of sight.
 */
export function visibleTail(area: SightArea, points: readonly Vec2[]): readonly Vec2[] {
  const last = points.length - 1;
  if (last < 0 || !seesPoint(area, points[last]!)) return [];
  for (let i = last - 1; i >= 0; i -= 1) {
    const p = points[i]!;
    if (!seesPoint(area, p)) return [edgeBetween(area, points[i + 1]!, p), ...points.slice(i + 1)];
  }
  return points;
}
