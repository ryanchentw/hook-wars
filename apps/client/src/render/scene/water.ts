import { Mesh, MeshStandardMaterial, PlaneGeometry, Vector2 } from 'three';
import { createWaterNormals, WATER_NORMAL_STEEPNESS } from '../textures';
import { COLORS } from '../theme';
import type { ArenaLayout } from './layout';

export type Water = { readonly mesh: Mesh; update(elapsed: number): void; dispose(): void };

const SWELL_SIZE = 22;
/** Apparent steepness of the swell, after undoing the exaggeration baked into the normal texture. */
const RIPPLE = 0.9 / WATER_NORMAL_STEEPNESS;
const DRIFT = { x: 0.004, y: 0.011 };

/** One big murky sheet under everything; the quay walls cut the canal out of it. */
export function createWater(layout: ArenaLayout['water']): Water {
  const normals = createWaterNormals();
  normals.repeat.set(layout.width / SWELL_SIZE, layout.depth / SWELL_SIZE);
  const material = new MeshStandardMaterial({
    color: COLORS.water,
    roughness: 0.42,
    metalness: 0,
    normalMap: normals,
    normalScale: new Vector2(RIPPLE, RIPPLE),
  });
  const geometry = new PlaneGeometry(layout.width, layout.depth);
  const mesh = new Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(layout.centre.x, layout.level, layout.centre.z);
  mesh.receiveShadow = true;
  return {
    mesh,
    update(elapsed) {
      normals.offset.set(elapsed * DRIFT.x, elapsed * DRIFT.y);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      normals.dispose();
    },
  };
}
