import { Color, type MeshStandardMaterial } from 'three';
import { HIT_FLASH } from '../theme';

/**
 * Lights a figure white by the given amount, 0 to 1, through the glow its materials already have,
 * so no shader is recompiled mid-fight.
 */
export function createFlash(materials: readonly MeshStandardMaterial[]): (amount: number) => void {
  const white = new Color(HIT_FLASH.color);
  const resting = materials.map((material) => ({ material, emissive: material.emissive.clone(), intensity: material.emissiveIntensity }));
  let shown = 0;

  return (amount) => {
    if (amount === shown) return;
    shown = amount;
    for (const { material, emissive, intensity } of resting) {
      material.emissive.copy(emissive).lerp(white, amount);
      material.emissiveIntensity = intensity + (HIT_FLASH.intensity - intensity) * amount;
    }
  };
}
