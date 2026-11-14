import { AdditiveBlending, DynamicDrawUsage, InstancedMesh, Matrix4, MeshBasicMaterial, NormalBlending, PlaneGeometry, Vector3, type Texture } from 'three';
import type { Animated, Drift } from '../types';

function fraction(seed: number): number {
  const s = Math.sin(seed * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

function wrap(value: number, min: number, max: number): number {
  const span = max - min;
  return min + ((((value - min) % span) + span) % span);
}

/** How close to a face of its box a dot starts to fade, as a fraction of the box, so none pops in or out at the edge. */
const EDGE_FADE = 0.15;

function edgeFade(value: number, min: number, max: number): number {
  const t = (value - min) / (max - min);
  return Math.min(1, Math.min(t, 1 - t) / EDGE_FADE);
}

/** Soft dots adrift in a box, each a card turned to the camera: fog banks when they are big and pale, motes when they are small. One draw call. */
export function createDrift(spec: Drift, softDot: Texture): Animated {
  const { min, max } = spec.box;
  const starts = Array.from({ length: spec.count }, (_, i) => ({
    x: min.x + fraction(i + 1) * (max.x - min.x),
    y: min.y + fraction(i + 101) * (max.y - min.y),
    z: min.z + fraction(i + 201) * (max.z - min.z),
    // Each drifts at its own pace and size, so the pattern never repeats as a block.
    pace: 0.6 + 0.8 * fraction(i + 301),
    size: spec.size * (0.7 + 0.6 * fraction(i + 401)),
  }));
  const geometry = new PlaneGeometry(1, 1);
  const material = new MeshBasicMaterial({
    map: softDot,
    color: spec.color,
    transparent: true,
    opacity: spec.opacity,
    depthWrite: false,
    blending: spec.additive ? AdditiveBlending : NormalBlending,
    fog: false,
  });
  const mesh = new InstancedMesh(geometry, material, spec.count);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  const matrix = new Matrix4();
  const at = new Vector3();
  const scale = new Vector3();

  return {
    group: mesh,
    update(elapsed, camera) {
      starts.forEach((start, i) => {
        at.set(
          wrap(start.x + spec.velocity.x * start.pace * elapsed, min.x, max.x),
          wrap(start.y + spec.velocity.y * start.pace * elapsed, min.y, max.y),
          wrap(start.z + spec.velocity.z * start.pace * elapsed, min.z, max.z),
        );
        // Only along the way it travels: across it, a dot at the edge of the box has every right to be there.
        const fade = (spec.velocity.x === 0 ? 1 : edgeFade(at.x, min.x, max.x)) * (spec.velocity.z === 0 ? 1 : edgeFade(at.z, min.z, max.z));
        mesh.setMatrixAt(i, matrix.compose(at, camera.quaternion, scale.setScalar(start.size * (0.4 + 0.6 * fade))));
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      mesh.dispose();
    },
  };
}
