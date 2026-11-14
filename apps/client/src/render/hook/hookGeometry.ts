import { CatmullRomCurve3, ConeGeometry, Quaternion, TorusGeometry, TubeGeometry, Vector3, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Shape of the hook in its own flat plane, sized to fit a circle of radius 1 and pointing along +x:
 * a ring for the chain, a straight shank, and a bend that curls back into a barbed point.
 */
const SHAPE = {
  thickness: 0.19,
  eye: { x: -0.95, radius: 0.15 },
  shank: { from: -0.8, to: 0.25, z: -0.15 },
  bend: { radius: 0.42, fromDeg: -90, toDeg: 140, stepDeg: 10 },
  point: { length: 0.46, radius: 0.2 },
  barb: { length: 0.34, radius: 0.12, splayDeg: 150 },
  /** Shifts the outline so the circle it fits is centred on the origin. */
  centre: { x: 0.2, z: -0.27 },
} as const;

const DEG = Math.PI / 180;
const UP = new Vector3(0, 1, 0);

function cone(length: number, radius: number, base: Vector3, direction: Vector3): BufferGeometry {
  const geometry = new ConeGeometry(radius, length, 8);
  geometry.translate(0, length / 2, 0);
  geometry.applyQuaternion(new Quaternion().setFromUnitVectors(UP, direction.clone().normalize()));
  geometry.translate(base.x, base.y, base.z);
  return geometry;
}

/** Radius-1 hook lying in the xz plane with its bend leading along +x and the chain ring trailing. */
export function createHookGeometry(): BufferGeometry {
  const { shank, bend } = SHAPE;
  const bendCentre = new Vector3(shank.to, 0, shank.z + bend.radius);
  const outline = [new Vector3(shank.from, 0, shank.z), new Vector3((shank.from + shank.to) / 2, 0, shank.z)];
  for (let a = bend.fromDeg; a <= bend.toDeg; a += bend.stepDeg) {
    outline.push(new Vector3(bendCentre.x + Math.cos(a * DEG) * bend.radius, 0, bendCentre.z + Math.sin(a * DEG) * bend.radius));
  }
  const curve = new CatmullRomCurve3(outline);
  const tip = curve.getPoint(1);
  const tangent = curve.getTangent(1);
  const barbDirection = tangent.clone().applyAxisAngle(UP, SHAPE.barb.splayDeg * DEG);
  const barbBase = tip.clone().addScaledVector(tangent, SHAPE.point.length * 0.45);

  const eye = new TorusGeometry(SHAPE.eye.radius, SHAPE.thickness * 0.55, 6, 14);
  eye.rotateX(Math.PI / 2);
  eye.translate(SHAPE.eye.x, 0, shank.z);

  const parts = [
    new TubeGeometry(curve, 48, SHAPE.thickness, 8),
    cone(SHAPE.point.length, SHAPE.point.radius, tip, tangent),
    cone(SHAPE.barb.length, SHAPE.barb.radius, barbBase, barbDirection),
    eye,
  ];
  const merged = mergeGeometries(parts);
  parts.forEach((part) => part.dispose());
  if (merged === null) throw new Error('Hook parts could not be merged into one mesh');
  merged.translate(SHAPE.centre.x, 0, SHAPE.centre.z);
  return merged;
}

/** How far behind the hook's centre the chain ring sits, in hook radii. */
export const HOOK_EYE_OFFSET = -(SHAPE.eye.x + SHAPE.centre.x);
