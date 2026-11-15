import type { Camera, Scene, WebGLRenderer } from 'three';
import type { BloomSpec } from '../scenes/types';
import { createBloom, type Bloom } from './bloom';

export type Pipeline = {
  /** Draws the scene to the canvas in one pass, as it always was, then lays the glow over it when there is one. */
  render(scene: Scene, camera: Camera, bloom: BloomSpec | null): void;
  dispose(): void;
};

export function createPipeline(gl: WebGLRenderer): Pipeline {
  // Built on first use, so a page that never asks for bloom holds no buffers for it.
  let glow: Bloom | null = null;
  return {
    render(scene, camera, bloom) {
      gl.render(scene, camera);
      if (bloom === null) return;
      glow ??= createBloom(gl);
      glow.render(scene, camera, bloom);
    },
    dispose() {
      glow?.dispose();
      glow = null;
    },
  };
}
