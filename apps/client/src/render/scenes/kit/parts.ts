import { Box3, Euler, Matrix4, Quaternion, Vector3 } from 'three';
import type { Vec3 } from '../../space';
import type { Footprint } from '../types';

export type Shape =
  | { readonly kind: 'box'; readonly size: Vec3 }
  /** Upright: `radius` at the foot, `topRadius` at the head (0 makes a cone). */
  | { readonly kind: 'cylinder'; readonly radius: number; readonly topRadius: number; readonly height: number; readonly sides: number }
  | { readonly kind: 'ball'; readonly radius: number; readonly detail: number }
  /** A ring lying flat: `radius` to the middle of a tube `tube` thick. */
  | { readonly kind: 'ring'; readonly radius: number; readonly tube: number; readonly sides: number }
  /** A flat rectangle facing up, `x` wide and `z` deep. */
  | { readonly kind: 'sheet'; readonly size: { readonly x: number; readonly z: number } };

/** One primitive solid of a scene's dressing. Parts that share a paint are merged into one mesh. */
export type Part = {
  readonly shape: Shape;
  /** Centre of the shape. */
  readonly at: Vec3;
  /** Radians about x, then y, then z. */
  readonly turn: Vec3;
  readonly stretch: Vec3;
  /** Key into the scene's paints. */
  readonly paint: string;
  /** Multiplied into the paint's colour, so one paint can dress many slightly different things. */
  readonly tint: number;
  /** Slides this part's texture, in repeats, so neighbours do not show the same piece of it. */
  readonly slide: { readonly u: number; readonly v: number };
};

export type PartOptions = {
  readonly yaw?: number;
  readonly turn?: Vec3;
  readonly stretch?: Vec3;
  readonly tint?: number;
  readonly slide?: { readonly u: number; readonly v: number };
};

const NO_TURN: Vec3 = { x: 0, y: 0, z: 0 };
const NO_STRETCH: Vec3 = { x: 1, y: 1, z: 1 };
const NO_SLIDE = { u: 0, v: 0 };
const WHITE = 0xffffff;

function part(shape: Shape, paint: string, at: Vec3, options: PartOptions): Part {
  return {
    shape,
    paint,
    at,
    turn: options.turn ?? (options.yaw === undefined ? NO_TURN : { x: 0, y: options.yaw, z: 0 }),
    stretch: options.stretch ?? NO_STRETCH,
    tint: options.tint ?? WHITE,
    slide: options.slide ?? NO_SLIDE,
  };
}

/** A box given by its centre. */
export function box(paint: string, size: Vec3, at: Vec3, options: PartOptions = {}): Part {
  return part({ kind: 'box', size }, paint, at, options);
}

/** A box given by the span it fills on each axis. */
export function block(paint: string, x: readonly [number, number], y: readonly [number, number], z: readonly [number, number], options: PartOptions = {}): Part {
  const size = { x: x[1] - x[0], y: y[1] - y[0], z: z[1] - z[0] };
  return box(paint, size, { x: (x[0] + x[1]) / 2, y: (y[0] + y[1]) / 2, z: (z[0] + z[1]) / 2 }, options);
}

export type Round = { readonly radius: number; readonly topRadius?: number; readonly height: number; readonly sides?: number };

/** An upright cylinder or cone standing with its foot at `foot`. */
export function post(paint: string, round: Round, foot: Vec3, options: PartOptions = {}): Part {
  const shape: Shape = { kind: 'cylinder', radius: round.radius, topRadius: round.topRadius ?? round.radius, height: round.height, sides: round.sides ?? 10 };
  return part(shape, paint, { x: foot.x, y: foot.y + round.height / 2, z: foot.z }, options);
}

export function ball(paint: string, radius: number, at: Vec3, options: PartOptions & { readonly detail?: number } = {}): Part {
  return part({ kind: 'ball', radius, detail: options.detail ?? 1 }, paint, at, options);
}

export function ring(paint: string, size: { readonly radius: number; readonly tube: number; readonly sides?: number }, at: Vec3, options: PartOptions = {}): Part {
  return part({ kind: 'ring', radius: size.radius, tube: size.tube, sides: size.sides ?? 16 }, paint, at, options);
}

export function sheet(paint: string, x: readonly [number, number], z: readonly [number, number], y: number, options: PartOptions = {}): Part {
  return part({ kind: 'sheet', size: { x: x[1] - x[0], z: z[1] - z[0] } }, paint, { x: (x[0] + x[1]) / 2, y, z: (z[0] + z[1]) / 2 }, options);
}

/** A straight bar of square section from one point to another: a cable, a rail, a spar. */
export function bar(paint: string, from: Vec3, to: Vec3, thickness: number, options: PartOptions = {}): Part {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dy, dz);
  // The box lies along its own x; yaw swings it round, then roll about z lifts its far end.
  const turn = { x: 0, y: Math.atan2(-dz, dx), z: Math.asin(length === 0 ? 0 : dy / length) };
  const centre = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2, z: (from.z + to.z) / 2 };
  return part({ kind: 'box', size: { x: length, y: thickness, z: thickness } }, paint, centre, { ...options, turn });
}

export function moved(parts: readonly Part[], by: Vec3): readonly Part[] {
  return parts.map((p) => ({ ...p, at: { x: p.at.x + by.x, y: p.at.y + by.y, z: p.at.z + by.z } }));
}

function halfExtents(shape: Shape): Vec3 {
  switch (shape.kind) {
    case 'box':
      return { x: shape.size.x / 2, y: shape.size.y / 2, z: shape.size.z / 2 };
    case 'cylinder': {
      const r = Math.max(shape.radius, shape.topRadius);
      return { x: r, y: shape.height / 2, z: r };
    }
    case 'ball':
      return { x: shape.radius, y: shape.radius, z: shape.radius };
    case 'ring':
      return { x: shape.radius + shape.tube, y: shape.tube, z: shape.radius + shape.tube };
    case 'sheet':
      return { x: shape.size.x / 2, y: 0, z: shape.size.z / 2 };
  }
}

/** The transform that carries a part's shape, centred on the origin, to where it stands. */
export function partMatrix(p: Part): Matrix4 {
  const turn = new Quaternion().setFromEuler(new Euler(p.turn.x, p.turn.y, p.turn.z, 'YZX'));
  return new Matrix4().compose(new Vector3(p.at.x, p.at.y, p.at.z), turn, new Vector3(p.stretch.x, p.stretch.y, p.stretch.z));
}

/** The box on the ground plan a part stands in. Exact for boxes and upright cylinders, never too small for anything else. */
export function footprintOf(p: Part): Footprint {
  const half = halfExtents(p.shape);
  const bounds = new Box3(new Vector3(-half.x, -half.y, -half.z), new Vector3(half.x, half.y, half.z)).applyMatrix4(partMatrix(p));
  return { label: p.paint, x0: bounds.min.x, x1: bounds.max.x, z0: bounds.min.z, z1: bounds.max.z, top: bounds.max.y };
}

/** How far the parts reach sideways from a centre line: the radius of the smallest upright cylinder about it that holds them all. */
export function reachFrom(parts: readonly Part[], centre: { readonly x: number; readonly z: number }): number {
  return parts.reduce((most, p) => {
    const f = footprintOf(p);
    const upright = p.shape.kind !== 'box' && p.shape.kind !== 'sheet';
    const dx = Math.max(Math.abs(f.x0 - centre.x), Math.abs(f.x1 - centre.x));
    const dz = Math.max(Math.abs(f.z0 - centre.z), Math.abs(f.z1 - centre.z));
    // A round part reaches its radius in every direction; a box reaches furthest at its corners.
    return Math.max(most, upright ? Math.max(dx, dz) : Math.hypot(dx, dz));
  }, 0);
}
