import type { GameEvent, PlayerId, SeenEvent, TeamId, Vec2 } from './types';
import { seesPoint, type Sight } from './vision';

type Judge = {
  readonly sight: Sight;
  /** The team each player is on. */
  readonly teamOf: (id: PlayerId) => TeamId | undefined;
};

const seen = ({ sight }: Judge, id: PlayerId): boolean => sight.players.has(id);
const ours = ({ sight, teamOf }: Judge, id: PlayerId): boolean => teamOf(id) === sight.viewer;
const inSight = ({ sight }: Judge, p: Vec2): boolean => seesPoint(sight.area, p);

type Rules = { readonly [K in GameEvent['kind']]: (event: Extract<GameEvent, { kind: K }>, judge: Judge) => SeenEvent | null };

const keepIf = <E extends GameEvent>(event: E, kept: boolean): E | null => (kept ? event : null);

/**
 * What of each event a team may learn under fog, in one place. Seen means seen after the step that made it, so a
 * fighter the step dragged into the open counts as seen. A purchase is never news across the water: gold is hidden.
 */
const RULES: Rules = {
  hookCast: (e, j) => keepIf(e, seen(j, e.ownerId)),
  hookBounce: (e, j) => keepIf(e, inSight(j, e.at) || j.sight.hooks.has(e.hookId)),
  hookHit: (e, j) => keepIf(e, seen(j, e.ownerId) || seen(j, e.targetId)),
  melee: (e, j) => keepIf(e, seen(j, e.attackerId) || seen(j, e.targetId) || inSight(j, e.at)),
  kill: (e, j) => (seen(j, e.victimId) ? e : { ...e, at: null }),
  purchase: (e, j) => keepIf(e, ours(j, e.playerId)),
  grappleCast: (e, j) => keepIf(e, seen(j, e.ownerId)),
  grappleLand: (e, j) => keepIf(e, inSight(j, e.at) || j.sight.grapples.has(e.grappleId)),
  grappleArrive: (e, j) => keepIf(e, seen(j, e.playerId)),
  respawn: (e, j) => keepIf(e, seen(j, e.playerId)),
  matchEnd: (e) => e,
};

export function seenEvents(events: readonly GameEvent[], sight: Sight, teamOf: Judge['teamOf']): readonly SeenEvent[] {
  if (sight.area.kind === 'everywhere') return events;
  const judge: Judge = { sight, teamOf };
  return events.flatMap((event) => {
    const rule = RULES[event.kind] as (e: GameEvent, j: Judge) => SeenEvent | null;
    const kept = rule(event, judge);
    return kept === null ? [] : [kept];
  });
}
