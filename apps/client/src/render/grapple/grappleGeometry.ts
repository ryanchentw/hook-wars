import { ConeGeometry, CylinderGeometry, Quaternion, TorusGeometry, Vector3, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * A grapnel sized to fit a circle of radius 1, leading along +x: a ring for the rope, a short shank,
 * a spike out front and three prongs that sweep back towards the thrower, the way the claw catches.
 */
const SHAPE = {
  shank: { from: -0.7, to: 0.35, radius: 0.09 },
  eye: { x: -0.82, radius: 0.14, thickness: 0.05 },
  spike: { length: 0.4, radius: 0.12 },
  prong: { count: 3, length: 0.75, radius: 0.09, back: 0.7 },
} as const;

const UP = new Vector3(0, 1, 0);

function cone(length: number, radius: number, base: Vector3, direction: Vector3): BufferGeometry {
  const geometry = new ConeGeometry(radius, length, 6);
  geometry.translate(0, length / 2, 0);
  geometry.applyQuaternion(new Quaternion().setFromUnitVectors(UP, direction.clone().normalize()));
  geometry.translate(base.x, base.y, base.z);
  return geometry;
}

function prongs(): readonly BufferGeometry[] {
  const { prong, shank } = SHAPE;
  const root = new Vector3(shank.to, 0, 0);
  return Array.from({ length: prong.count }, (_, i) => {
    // Turned a little so, seen from above, no prong hides behind the shank.
    const around = (i / prong.count) * Math.PI * 2 + Math.PI / 6;
    const direction = new Vector3(-prong.back, Math.cos(around), Math.sin(around));
    return cone(prong.length, prong.radius, root, direction);
  });
}

/** Radius-1 grapnel lying along +x, its rope ring trailing towards -x. */
export function createGrappleGeometry(): BufferGeometry {
  const { shank, eye, spike } = SHAPE;
  const shaft = new CylinderGeometry(shank.radius, shank.radius, shank.to - shank.from, 6);
  shaft.rotateZ(Math.PI / 2);
  shaft.translate((shank.from + shank.to) / 2, 0, 0);
  const ring = new TorusGeometry(eye.radius, eye.thickness, 5, 10);
  ring.translate(eye.x, 0, 0);
  const parts = [shaft, ring, cone(spike.length, spike.radius, new Vector3(shank.to, 0, 0), new Vector3(1, 0, 0)), ...prongs()];
  const merged = mergeGeometries([...parts]);
  parts.forEach((part) => part.dispose());
  if (merged === null) throw new Error('Grapple parts could not be merged into one mesh');
  return merged;
}

/** How far behind the claw's centre the rope ring sits, in claw radii. */
export const GRAPPLE_EYE_OFFSET = -SHAPE.eye.x;
