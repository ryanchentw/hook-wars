import { AdditiveBlending, type Material, type Object3D } from 'three';

/** Everything that gives light is on this layer as well as its own, so it can be drawn alone as the source of the glow. */
export const EMITTER_LAYER = 1;

/** Marks an unlit material as a light source. One that blends additively needs no mark: adding light is what it does. */
export function emits<M extends Material>(material: M): M {
  material.userData.emits = true;
  return material;
}

const gives = (material: Material): boolean => material.blending === AdditiveBlending || material.userData.emits === true;

function isEmitter(object: Object3D): boolean {
  const material = (object as { material?: Material | readonly Material[] }).material;
  if (material === undefined) return false;
  return Array.isArray(material) ? material.some(gives) : gives(material as Material);
}

/**
 * Puts every light source under `root` on the emitter layer. Run each frame: hooks, sparks and flashes come and go,
 * and one rule here is what keeps a new effect glowing without its author having to know that bloom exists.
 */
export function tagEmitters(root: Object3D): void {
  root.traverse((object) => {
    if (isEmitter(object)) object.layers.enable(EMITTER_LAYER);
  });
}
