import { BackSide, BufferAttribute, Color, Mesh, MeshBasicMaterial, SphereGeometry } from 'three';
import type { Animated, Atmosphere } from '../types';

/** Inside the camera's far plane from anywhere the camera goes. */
const RADIUS = 330;
/** The gradient runs from the horizon up to this fraction of the dome's height; above it the sky is the zenith colour. */
const GRADIENT_TOP = 0.45;

/**
 * A dome shaded from the horizon colour up to the zenith colour. Only the establishing shot ever looks at it:
 * the gameplay camera points at the ground.
 */
export function createSky(sky: NonNullable<Atmosphere['sky']>, centre: { readonly x: number; readonly z: number }): Animated {
  const geometry = new SphereGeometry(RADIUS, 24, 12);
  const positions = geometry.getAttribute('position');
  const colors = new Float32Array(positions.count * 3);
  const zenith = new Color(sky.zenith);
  const horizon = new Color(sky.horizon);
  const shade = new Color();
  for (let i = 0; i < positions.count; i += 1) {
    const height = Math.min(1, Math.max(0, positions.getY(i) / RADIUS / GRADIENT_TOP));
    shade.copy(horizon).lerp(zenith, height ** 0.7);
    shade.toArray(colors, i * 3);
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  const material = new MeshBasicMaterial({ vertexColors: true, side: BackSide, fog: false, depthWrite: false });
  const mesh = new Mesh(geometry, material);
  mesh.position.set(centre.x, 0, centre.z);
  mesh.renderOrder = -1;
  return {
    group: mesh,
    update: () => undefined,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
