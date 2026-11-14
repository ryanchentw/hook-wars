import type { Vec2 } from '@hookbrawl/sim';

export type Vec3 = { readonly x: number; readonly y: number; readonly z: number };

/** One dungeon floor tile (4 world units) spans 125 sim units, so a 1000-unit dock is exactly eight tiles wide. */
export const WORLD_PER_SIM = 0.032;

/** glTF characters look down +z in their own space. */
export const MODEL_FORWARD: Vec3 = { x: 0, y: 0, z: 1 };

export function toWorldLength(simLength: number): number {
  return simLength * WORLD_PER_SIM;
}

/** Sim (x, y) lies on the world ground plane as (x, 0, y); `height` is in world units. */
export function simToWorld(p: Vec2, height = 0): Vec3 {
  return { x: p.x * WORLD_PER_SIM, y: height, z: p.y * WORLD_PER_SIM };
}

export function worldToSim(p: { readonly x: number; readonly z: number }): Vec2 {
  return { x: p.x / WORLD_PER_SIM, y: p.z / WORLD_PER_SIM };
}

/** Rotation about world +y that turns a +z-facing model to look along a sim facing (0 rad = +x). */
export function facingToYaw(facing: number): number {
  return Math.PI / 2 - facing;
}
