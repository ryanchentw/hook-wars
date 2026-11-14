import { Mesh, MeshStandardMaterial, PlaneGeometry, Vector2 } from 'three';
import { createWaterNormals, WATER_NORMAL_STEEPNESS } from '../../textures';
import type { Animated, WaterSheet, WaterSpec } from '../types';

/** One big sheet under everything; whatever walls the platforms stand on cut the strip out of it. */
export function createWater(spec: WaterSpec, sheet: WaterSheet): Animated {
  const normals = createWaterNormals();
  normals.repeat.set(sheet.width / spec.swellSize, sheet.depth / spec.swellSize);
  // Undoes the exaggeration baked into the normal texture.
  const ripple = spec.ripple / WATER_NORMAL_STEEPNESS;
  const material = new MeshStandardMaterial({
    color: spec.color,
    roughness: spec.roughness,
    metalness: spec.metalness,
    normalMap: normals,
    normalScale: new Vector2(ripple, ripple),
  });
  const geometry = new PlaneGeometry(sheet.width, sheet.depth);
  const mesh = new Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(sheet.centre.x, spec.level, sheet.centre.z);
  mesh.receiveShadow = true;
  return {
    group: mesh,
    update(elapsed) {
      normals.offset.set(elapsed * spec.drift.x, elapsed * spec.drift.y);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      normals.dispose();
    },
  };
}
