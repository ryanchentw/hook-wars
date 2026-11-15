import { HalfFloatType, Vector2, WebGLRenderTarget, type Camera, type Scene, type WebGLRenderer } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type { BloomSpec } from '../scenes/types';

export type Pipeline = {
  /** Draws the scene to the canvas. With no bloom it goes straight there in one pass, as it always did. */
  render(scene: Scene, camera: Camera, bloom: BloomSpec | null): void;
  dispose(): void;
};

/** Matches the canvas's own antialiasing, which the offscreen picture would otherwise lose. */
const SAMPLES = 4;

type Chain = {
  readonly composer: EffectComposer;
  readonly scenePass: RenderPass;
  readonly bloomPass: UnrealBloomPass;
  readonly outputPass: OutputPass;
  readonly size: Vector2;
};

/**
 * The scene in scene-linear light at half-float precision, so a lamp can be many times brighter than white; bloom
 * takes what is over its threshold from that; the last pass applies the tone mapping and colour space the canvas
 * would have applied itself.
 */
function createChain(gl: WebGLRenderer, scene: Scene, camera: Camera): Chain {
  const size = gl.getDrawingBufferSize(new Vector2());
  const composer = new EffectComposer(gl, new WebGLRenderTarget(size.x, size.y, { type: HalfFloatType, samples: SAMPLES }));
  const scenePass = new RenderPass(scene, camera);
  const bloomPass = new UnrealBloomPass(size.clone(), 0, 0, 0);
  const outputPass = new OutputPass();
  composer.addPass(scenePass);
  composer.addPass(bloomPass);
  composer.addPass(outputPass);
  return { composer, scenePass, bloomPass, outputPass, size };
}

/** Built on first use, so a page that never asks for bloom holds no offscreen buffers. */
export function createPipeline(gl: WebGLRenderer): Pipeline {
  let chain: Chain | null = null;
  const measured = new Vector2();

  return {
    render(scene, camera, bloom) {
      if (bloom === null) return gl.render(scene, camera);
      chain ??= createChain(gl, scene, camera);
      const { composer, scenePass, bloomPass, size } = chain;
      if (!gl.getDrawingBufferSize(measured).equals(size)) {
        size.copy(measured);
        composer.setSize(size.x, size.y);
      }
      scenePass.scene = scene;
      scenePass.camera = camera;
      bloomPass.strength = bloom.strength;
      bloomPass.radius = bloom.radius;
      bloomPass.threshold = bloom.threshold;
      composer.render();
    },
    dispose() {
      chain?.bloomPass.dispose();
      chain?.outputPass.dispose();
      chain?.composer.dispose();
      chain = null;
    },
  };
}
