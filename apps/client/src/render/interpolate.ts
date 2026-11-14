import type { GameState, Grapple, Hook, Player, Vec2 } from '@hookbrawl/sim';
import type { Frame } from '../game/session';

export type PlayerFrame = { readonly player: Player; readonly pos: Vec2 };
export type HookFrame = {
  readonly hook: Hook;
  readonly team: Player['team'] | null;
  readonly head: Vec2;
  /** Polyline from the owner's hand, through any bounce points, to the head. */
  readonly chain: readonly Vec2[];
};
/** The rope runs from the owner's hand to `head`, so a pulling grapple's rope shortens as the owner is hauled in. */
export type GrappleFrame = {
  readonly grapple: Grapple;
  readonly team: Player['team'] | null;
  readonly head: Vec2;
};
export type RenderFrame = {
  readonly state: GameState;
  readonly players: readonly PlayerFrame[];
  readonly hooks: readonly HookFrame[];
  readonly grapples: readonly GrappleFrame[];
};

// A jump larger than this between two ticks is a teleport (respawn), not motion.
const SNAP_DISTANCE = 200;

export function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function shouldSnap(before: Player, after: Player): boolean {
  if (before.status.kind === 'dead' && after.status.kind !== 'dead') return true;
  return Math.hypot(after.pos.x - before.pos.x, after.pos.y - before.pos.y) > SNAP_DISTANCE;
}

function playerFrame(previous: GameState, player: Player, alpha: number): PlayerFrame {
  const before = previous.players.find((p) => p.id === player.id);
  if (before === undefined || shouldSnap(before, player)) return { player, pos: player.pos };
  return { player, pos: lerp(before.pos, player.pos, alpha) };
}

function hookFrame(previous: GameState, hook: Hook, players: readonly PlayerFrame[], alpha: number): HookFrame {
  const before = previous.hooks.find((h) => h.id === hook.id);
  const head = before === undefined ? hook.pos : lerp(before.pos, hook.pos, alpha);
  const owner = players.find((p) => p.player.id === hook.ownerId);
  const team = owner?.player.team ?? null;
  const hand = owner?.pos ?? hook.path[0] ?? head;
  if (hook.phase.kind === 'retracting') return { hook, team, head, chain: [hand, head] };
  // The sim records the cast origin, but the thrower keeps walking, so the chain starts at the live hand.
  return { hook, team, head, chain: [hand, ...hook.path.slice(1), head] };
}

function grappleFrame(previous: GameState, grapple: Grapple, players: readonly PlayerFrame[], alpha: number): GrappleFrame {
  const before = previous.grapples.find((g) => g.id === grapple.id);
  const team = players.find((p) => p.player.id === grapple.ownerId)?.player.team ?? null;
  return { grapple, team, head: before === undefined ? grapple.pos : lerp(before.pos, grapple.pos, alpha) };
}

export function interpolateFrame(frame: Frame): RenderFrame {
  const { previous, current, alpha } = frame;
  const players = current.players.map((p) => playerFrame(previous, p, alpha));
  const hooks = current.hooks.map((h) => hookFrame(previous, h, players, alpha));
  const grapples = current.grapples.map((g) => grappleFrame(previous, g, players, alpha));
  return { state: current, players, hooks, grapples };
}
