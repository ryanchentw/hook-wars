import { hookStats, TUNING } from '@hookbrawl/sim';
import type { Player, TeamId } from '@hookbrawl/sim';
import { Mesh, MeshStandardMaterial, type BufferGeometry, type Material, type Object3D } from 'three';
import { createHiddenMaterial, facesFor } from '../hook/hookMaterials';
import { COLORS, HELD_HOOK, SIZES, TEAM_COLORS } from '../theme';

export type HeldHook = {
  readonly mesh: Mesh<BufferGeometry, Material[]>;
  /** Drawn on every face of the hook, so flashing or fading it covers the barb's spurs too. */
  readonly material: MeshStandardMaterial;
  /** Shows the hook unless it is out on its chain, at the size its owner would throw it, with spurs once barbed. */
  update(player: Player, hookOut: boolean): void;
  dispose(): void;
};

/** Grows the carried hook in step with the one its owner would throw; `simRadius` is that hook's radius in sim units. */
function sizeHeldHook(hook: Object3D, simRadius: number): void {
  // The bone sits inside the figure's own scale, which this cancels so the size is in world units.
  const scale = (HELD_HOOK.radius * (simRadius / TUNING.hookRadius)) / SIZES.characterScale.x;
  hook.scale.setScalar(scale);
  hook.position.y = HELD_HOOK.grip * scale;
}

/**
 * The hook as a fighter carries it, to hang on the hand slot bone. The slot's +y runs out of the top of the fist,
 * the way the pack's swords point, so the shank is stood along it with the fist closed just above the chain ring.
 */
export function createHeldHook(geometry: BufferGeometry, team: TeamId): HeldHook {
  const material = new MeshStandardMaterial({
    color: COLORS.iron,
    roughness: 0.34,
    metalness: 0.6,
    emissive: TEAM_COLORS[team].glow,
    emissiveIntensity: HELD_HOOK.glow,
  });
  const hidden = createHiddenMaterial();
  const plain = facesFor(material, hidden, false);
  const barbed = facesFor(material, hidden, true);
  const mesh = new Mesh(geometry, plain);
  mesh.rotation.z = Math.PI / 2;
  mesh.castShadow = true;
  sizeHeldHook(mesh, TUNING.hookRadius);
  let sizeLevel = 0;

  return {
    mesh,
    material,
    update(player, hookOut) {
      mesh.visible = !hookOut;
      mesh.material = player.items.barb.kind === 'owned' ? barbed : plain;
      if (player.upgrades.size === sizeLevel) return;
      sizeLevel = player.upgrades.size;
      sizeHeldHook(mesh, hookStats(player).radius);
    },
    dispose: () => hidden.dispose(),
  };
}
