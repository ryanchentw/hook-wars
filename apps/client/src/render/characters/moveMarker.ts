import type { Player } from '@hookbrawl/sim';
import { Mesh, MeshBasicMaterial, RingGeometry } from 'three';
import { simToWorld } from '../space';
import { COLORS, SIZES } from '../theme';

export type MoveMarker = { readonly mesh: Mesh; update(local: Player | undefined, elapsed: number): void; dispose(): void };

/** A small pulsing ring on the ground where the local player was told to walk. */
export function createMoveMarker(): MoveMarker {
  const geometry = new RingGeometry(SIZES.moveMarkerRadius * 0.7, SIZES.moveMarkerRadius, 24);
  const material = new MeshBasicMaterial({ color: COLORS.moveMarker, transparent: true, opacity: 0.6, depthWrite: false });
  const mesh = new Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.visible = false;

  return {
    mesh,
    update(local, elapsed) {
      const target = local !== undefined && local.status.kind === 'alive' ? local.moveTarget : null;
      mesh.visible = target !== null;
      if (target === null) return;
      const at = simToWorld(target, SIZES.ringLift);
      mesh.position.set(at.x, at.y, at.z);
      mesh.scale.setScalar(1 + 0.15 * Math.sin(elapsed * 9));
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
