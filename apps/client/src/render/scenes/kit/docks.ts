import { block, sheet, type Part } from './parts';
import type { Plan, Span } from './plan';

export type DockSpec = {
  /** Paints of the west and east walking surfaces; each is drawn once across its whole dock. */
  readonly ground: { readonly west: string; readonly east: string };
  /** Paint of the ground that carries on past the playable rectangle. */
  readonly apron: string;
  readonly body: string;
  readonly coping: string;
  /** How far the ground carries on north of the playable rectangle, and out past its west and east ends. */
  readonly north: number;
  readonly side: number;
  readonly south: number;
  /** How far down the dock's sides go: below the water, so no gap shows. */
  readonly depth: number;
  /** The pale edging set flush along every drop, so the edge of the walkable ground reads at a glance. */
  readonly copingWidth: number;
};

export type Extent = { readonly x: Span; readonly z: Span };

// Clear of the body's top face, so the two never fight for the same pixels.
const SKIN = 0.012;
const COPING_PROUD = 0.012;
const COPING_DEPTH = 0.4;

/** Each dock's whole extent on the ground plan, aprons included. */
export function dockExtents(plan: Plan, spec: Pick<DockSpec, 'north' | 'side' | 'south'>): { readonly west: Extent; readonly east: Extent } {
  const z = { from: -spec.north, to: plan.d + spec.south };
  return {
    west: { x: { from: -spec.side, to: plan.strip.from }, z },
    east: { x: { from: plan.strip.to, to: plan.w + spec.side }, z },
  };
}

/**
 * The two platforms as every procedural scene builds them: a solid body, one painted sheet over the playable part
 * of each, apron sheets around it, and pale coping along the strip and the south edge.
 */
export function docks(plan: Plan, spec: DockSpec): readonly Part[] {
  const extents = dockExtents(plan, spec);
  const play: Span = { from: 0, to: plan.d };
  const sides = [
    { ground: spec.ground.west, dock: plan.docks.west, whole: extents.west, edge: plan.strip.from, inward: -1 },
    { ground: spec.ground.east, dock: plan.docks.east, whole: extents.east, edge: plan.strip.to, inward: 1 },
  ];
  return sides.flatMap(({ ground, dock, whole, edge, inward }) => {
    const outer: Span = inward < 0 ? { from: whole.x.from, to: dock.from } : { from: dock.to, to: whole.x.to };
    const copingX: readonly [number, number] = inward < 0 ? [edge - spec.copingWidth, edge] : [edge, edge + spec.copingWidth];
    return [
      block(spec.body, [whole.x.from, whole.x.to], [-spec.depth, -SKIN], [whole.z.from, whole.z.to]),
      sheet(ground, [dock.from, dock.to], [play.from, play.to], 0),
      sheet(spec.apron, [whole.x.from, whole.x.to], [whole.z.from, 0], 0),
      sheet(spec.apron, [whole.x.from, whole.x.to], [plan.d, whole.z.to], 0),
      sheet(spec.apron, [outer.from, outer.to], [play.from, play.to], 0),
      block(spec.coping, copingX, [-COPING_DEPTH, COPING_PROUD], [whole.z.from, whole.z.to]),
    ];
  });
}

/** A post-and-rail fence along x at depth `z`: posts every `spacing`, with `rails` bars between the given heights. */
export type Fence = { readonly height: number; readonly spacing: number; readonly rails: number; readonly thickness: number };

export function fenceAlongX(paint: string, x: Span, z: number, spec: Fence): readonly Part[] {
  const count = Math.max(1, Math.round((x.to - x.from) / spec.spacing));
  const step = (x.to - x.from) / count;
  const posts = Array.from({ length: count + 1 }, (_, i) =>
    block(paint, [x.from + i * step - spec.thickness, x.from + i * step + spec.thickness], [0, spec.height], [z - spec.thickness, z + spec.thickness]),
  );
  const rails = Array.from({ length: spec.rails }, (_, i) => {
    const y = spec.height * ((i + 1) / spec.rails);
    return block(paint, [x.from, x.to], [y - spec.thickness * 0.8, y], [z - spec.thickness * 0.6, z + spec.thickness * 0.6]);
  });
  return [...posts, ...rails];
}
