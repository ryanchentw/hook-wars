import type { Hook, PlayerId, SeenGrapple, SeenPlayer, TeamId, TeamView, Vec2 } from '@hookwars/sim';
import type { Frame } from '../game/session';

/** `presence` runs from 0 to 1 as a fighter comes into sight, and back down as one leaves it. */
export type PlayerFrame = { readonly player: SeenPlayer; readonly pos: Vec2; readonly presence: number };
export type HookFrame = {
  readonly hook: Hook;
  readonly team: TeamId | null;
  readonly head: Vec2;
  /** Polyline from the owner's hand, or from the edge of sight, through any bounce points, to the head. */
  readonly chain: readonly Vec2[];
  /** The thrower is out of sight, so the chain comes out of the dark at its first point. */
  readonly cut: boolean;
};
/** The rope runs from the owner's hand, or from `ropeFrom` at the edge of sight, to `head`. */
export type GrappleFrame = {
  readonly grapple: SeenGrapple;
  readonly team: TeamId | null;
  readonly head: Vec2;
};
export type RenderFrame = {
  readonly state: TeamView;
  readonly players: readonly PlayerFrame[];
  readonly hooks: readonly HookFrame[];
  readonly grapples: readonly GrappleFrame[];
};

// A jump larger than this between two ticks is a teleport (respawn), not motion.
const SNAP_DISTANCE = 200;

export function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function shouldSnap(before: SeenPlayer, after: SeenPlayer): boolean {
  if (before.status.kind === 'dead' && after.status.kind !== 'dead') return true;
  return Math.hypot(after.pos.x - before.pos.x, after.pos.y - before.pos.y) > SNAP_DISTANCE;
}

function playerFrame(previous: TeamView, player: SeenPlayer, alpha: number): PlayerFrame {
  const before = previous.players.find((p) => p.id === player.id);
  if (before === undefined || shouldSnap(before, player)) return { player, pos: player.pos, presence: 1 };
  return { player, pos: lerp(before.pos, player.pos, alpha), presence: 1 };
}

type TeamOf = (id: PlayerId) => TeamId | null;

function hookFrame(previous: TeamView, hook: Hook, players: readonly PlayerFrame[], alpha: number, teamOf: TeamOf): HookFrame {
  const before = previous.hooks.find((h) => h.id === hook.id);
  const head = before === undefined ? hook.pos : lerp(before.pos, hook.pos, alpha);
  const owner = players.find((p) => p.player.id === hook.ownerId);
  const team = teamOf(hook.ownerId);
  const hand = owner?.pos ?? hook.path[0] ?? head;
  const cut = owner === undefined;
  if (hook.phase.kind === 'retracting') return { hook, team, head, chain: [hand, head], cut };
  // The sim records the cast origin, but the thrower keeps walking, so the chain starts at the live hand.
  return { hook, team, head, chain: [hand, ...hook.path.slice(1), head], cut };
}

function grappleFrame(previous: TeamView, grapple: SeenGrapple, alpha: number, teamOf: TeamOf): GrappleFrame {
  const before = previous.grapples.find((g) => g.id === grapple.id);
  return { grapple, team: teamOf(grapple.ownerId), head: before === undefined ? grapple.pos : lerp(before.pos, grapple.pos, alpha) };
}

export function interpolateFrame(frame: Frame): RenderFrame {
  const { previous, current, alpha } = frame;
  const players = current.players.map((p) => playerFrame(previous, p, alpha));
  const teamOf: TeamOf = (id) => current.roster.find((c) => c.id === id)?.team ?? null;
  const hooks = current.hooks.map((h) => hookFrame(previous, h, players, alpha, teamOf));
  const grapples = current.grapples.map((g) => grappleFrame(previous, g, alpha, teamOf));
  return { state: current, players, hooks, grapples };
}
