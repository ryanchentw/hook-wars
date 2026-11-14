import type { TeamId } from '@hookbrawl/sim';
import { Mesh, MeshStandardMaterial, type BufferGeometry } from 'three';
import { COLORS, HELD_HOOK, SIZES, TEAM_COLORS } from '../theme';

/**
 * The hook as a fighter carries it, to hang on the hand slot bone. The slot's +y runs out of the top of the fist,
 * the way the pack's swords point, so the shank is stood along it with the fist closed just above the chain ring.
 */
export function createHeldHook(geometry: BufferGeometry, team: TeamId): Mesh<BufferGeometry, MeshStandardMaterial> {
  const material = new MeshStandardMaterial({
    color: COLORS.iron,
    roughness: 0.34,
    metalness: 0.6,
    emissive: TEAM_COLORS[team].glow,
    emissiveIntensity: HELD_HOOK.glow,
  });
  const hook = new Mesh(geometry, material);
  // The bone sits inside the figure's own scale, which this cancels so the size below is in world units.
  const scale = HELD_HOOK.radius / SIZES.characterScale.x;
  hook.scale.setScalar(scale);
  hook.rotation.z = Math.PI / 2;
  hook.position.y = HELD_HOOK.grip * scale;
  hook.castShadow = true;
  return hook;
}
