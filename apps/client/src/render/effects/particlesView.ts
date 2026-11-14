import {
  AdditiveBlending,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  NormalBlending,
  PlaneGeometry,
  Vector3,
  type Camera,
  type Texture,
} from 'three';
import { MAX_PARTICLES, PARTICLE_STYLES, type Particle } from './particles';

export type ParticlesView = { readonly group: Group; draw(particles: readonly Particle[], camera: Camera): void; dispose(): void };

function layer(geometry: PlaneGeometry, softDot: Texture, glows: boolean): InstancedMesh<PlaneGeometry, MeshBasicMaterial> {
  const material = new MeshBasicMaterial({
    map: softDot,
    transparent: true,
    depthWrite: false,
    blending: glows ? AdditiveBlending : NormalBlending,
    fog: !glows,
  });
  const mesh = new InstancedMesh(geometry, material, MAX_PARTICLES);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;
  return mesh;
}

/** Draws every particle as a camera-facing soft dot: one instanced batch for glowing kinds, one for solid kinds. */
export function createParticlesView(softDot: Texture): ParticlesView {
  const geometry = new PlaneGeometry(1, 1);
  const glowing = layer(geometry, softDot, true);
  const solid = layer(geometry, softDot, false);
  const group = new Group();
  group.add(solid, glowing);
  const matrix = new Matrix4();
  const position = new Vector3();
  const scale = new Vector3();
  const color = new Color();

  return {
    group,
    draw(particles, camera) {
      const counts = new Map([[glowing, 0], [solid, 0]]);
      for (const p of particles) {
        const style = PARTICLE_STYLES[p.kind];
        const mesh = style.glows ? glowing : solid;
        const index = counts.get(mesh) ?? 0;
        const t = p.age / p.life;
        const size = p.size * (1 + (style.endScale - 1) * t);
        matrix.compose(position.set(p.position.x, p.position.y, p.position.z), camera.quaternion, scale.setScalar(size));
        mesh.setMatrixAt(index, matrix);
        // Additive dots fade by dimming; solid ones fade by the shrink or swell above.
        mesh.setColorAt(index, color.set(style.color).multiplyScalar(style.intensity * (style.glows ? 1 - t * t : 1)));
        counts.set(mesh, index + 1);
      }
      counts.forEach((count, mesh) => {
        mesh.count = count;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
      });
    },
    dispose() {
      geometry.dispose();
      [glowing, solid].forEach((mesh) => {
        mesh.material.dispose();
        mesh.dispose();
      });
    },
  };
}
