import type { Arena } from '@hookbrawl/sim';
import { toWorldLength } from '../../space';

export type Span = { readonly from: number; readonly to: number };

/** The sim's arena in world units: the measurements every scene lays itself out from. */
export type Plan = {
  /** The playable rectangle runs from the origin to (`w`, `d`); north is -z. */
  readonly w: number;
  readonly d: number;
  /** The impassable strip, as a span of x. */
  readonly strip: Span;
  readonly docks: { readonly west: Span; readonly east: Span };
  readonly obstacle: { readonly x: number; readonly z: number; readonly radius: number };
};

export function planOf(arena: Arena): Plan {
  const w = toWorldLength(arena.width);
  const strip = { from: toWorldLength(arena.canal.x0), to: toWorldLength(arena.canal.x1) };
  return {
    w,
    d: toWorldLength(arena.height),
    strip,
    docks: { west: { from: 0, to: strip.from }, east: { from: strip.to, to: w } },
    obstacle: { x: toWorldLength(arena.buoy.pos.x), z: toWorldLength(arena.buoy.pos.y), radius: toWorldLength(arena.buoy.radius) },
  };
}
