import { TUNING } from './config';
import { clampToRect, distance } from './geometry';
import type { Arena, Rect, TeamId, Vec2 } from './types';

export const TEAMS: readonly TeamId[] = ['west', 'east'];

/** Where a player's centre may stand on a dock. */
export function walkableRect(arena: Arena, dock: TeamId): Rect {
  const r = TUNING.playerRadius;
  const y0 = r;
  const y1 = arena.height - r;
  return dock === 'west'
    ? { x0: r, y0, x1: arena.canal.x0 - r, y1 }
    : { x0: arena.canal.x1 + r, y0, x1: arena.width - r, y1 };
}

/** The dock a point belongs to; a point over the canal belongs to the nearer bank. */
export function dockAt(arena: Arena, p: Vec2): TeamId {
  return p.x < (arena.canal.x0 + arena.canal.x1) / 2 ? 'west' : 'east';
}

export function clampToDock(arena: Arena, p: Vec2, dock: TeamId): Vec2 {
  return clampToRect(p, walkableRect(arena, dock));
}

export function clampToNearestDock(arena: Arena, p: Vec2): Vec2 {
  const [west, east] = [clampToDock(arena, p, 'west'), clampToDock(arena, p, 'east')];
  return distance(p, west) <= distance(p, east) ? west : east;
}

export function facingCanal(team: TeamId): number {
  return team === 'west' ? 0 : Math.PI;
}

export function spawnPoint(arena: Arena, team: TeamId, spawnIndex: number): Vec2 {
  const spawn = arena.spawns[team][spawnIndex];
  if (!spawn) throw new Error(`no ${team} spawn at index ${spawnIndex}`);
  return spawn;
}
