import type { Rect, Vec2 } from './types';

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, y: a.y * k });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const length = (a: Vec2): number => Math.hypot(a.x, a.y);
export const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const along = (p: Vec2, dir: Vec2, t: number): Vec2 => ({ x: p.x + dir.x * t, y: p.y + dir.y * t });

export function normalize(a: Vec2): Vec2 {
  const len = length(a);
  return len === 0 ? { x: 0, y: 0 } : { x: a.x / len, y: a.y / len };
}

export function rotate(a: Vec2, angle: number): Vec2 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: a.x * c - a.y * s, y: a.x * s + a.y * c };
}

/** Mirrors `dir` about the surface with unit normal `normal`. */
export function reflect(dir: Vec2, normal: Vec2): Vec2 {
  return sub(dir, scale(normal, 2 * dot(dir, normal)));
}

export function clampToRect(p: Vec2, rect: Rect): Vec2 {
  return {
    x: Math.min(Math.max(p.x, rect.x0), rect.x1),
    y: Math.min(Math.max(p.y, rect.y0), rect.y1),
  };
}

/**
 * Earliest distance t in [0, maxT] at which a point moving from `p` along unit `dir`
 * comes within `radius` of `center`, or null. A start already inside counts as t = 0.
 */
export function sweepCircle(p: Vec2, dir: Vec2, maxT: number, center: Vec2, radius: number): number | null {
  const offset = sub(p, center);
  const c = dot(offset, offset) - radius * radius;
  if (c <= 0) return 0;
  const b = dot(offset, dir);
  if (b >= 0) return null;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t <= maxT ? t : null;
}
