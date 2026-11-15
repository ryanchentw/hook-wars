import { AdditiveBlending, FogExp2, HalfFloatType, ShaderMaterial, Vector2, WebGLRenderTarget, type Camera, type Scene, type Texture, type WebGLRenderer } from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import type { BloomSpec } from '../scenes/types';
import { ADD, BRIGHT, GROW, SHRINK, VERTEX } from './bloomShaders';
import { EMITTER_LAYER, tagEmitters } from './emitters';

/** Glow laid over a picture already on the canvas. */
export type Bloom = {
  /** Call once the scene is drawn to the canvas from `camera` and before the frame is handed over. */
  render(scene: Scene, camera: Camera, spec: BloomSpec): void;
  dispose(): void;
};

/** Blur levels, each half the one before; the first is a quarter of the canvas each way, the last 1/32. */
const LEVELS = 4;
/** How far under the threshold the glow starts to come in. */
const KNEE = 0.1;

function pass(fragmentShader: string, uniforms: Record<string, { value: unknown }>, additive = false): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader,
    uniforms,
    depthTest: false,
    depthWrite: false,
    ...(additive ? { blending: AdditiveBlending, transparent: true } : {}),
  });
}

type Passes = { readonly bright: ShaderMaterial; readonly shrink: ShaderMaterial; readonly grow: ShaderMaterial; readonly add: ShaderMaterial };

function createPasses(): Passes {
  const source = (): { value: Texture | null } => ({ value: null });
  return {
    bright: pass(BRIGHT, { source: source(), texel: { value: new Vector2() }, threshold: { value: 1 }, knee: { value: KNEE } }),
    shrink: pass(SHRINK, { source: source(), texel: { value: new Vector2() } }),
    grow: pass(GROW, { source: source(), sharper: source(), texel: { value: new Vector2() }, spread: { value: 0 } }),
    add: pass(ADD, { source: source(), strength: { value: 0 } }, true),
  };
}

const halfFloat = (depthBuffer: boolean): WebGLRenderTarget => new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthBuffer });

/**
 * Draws the scene's light sources alone, in scene light where a lamp can be many times brighter than white, and so
 * with nothing between them and the eye: a glow shows over a fighter standing in front of its lamp, which reads as glare.
 */
function drawSources(gl: WebGLRenderer, scene: Scene, camera: Camera, into: WebGLRenderTarget): void {
  tagEmitters(scene);
  const kept = { layers: camera.layers.mask, background: scene.background, density: scene.fog instanceof FogExp2 ? scene.fog.density : 0, shadows: gl.shadowMap.autoUpdate };
  camera.layers.set(EMITTER_LAYER);
  scene.background = null;
  // Fog would fade a far lamp towards the fog's colour, and by day that colour is itself bright enough to glow.
  if (scene.fog instanceof FogExp2) scene.fog.density = 0;
  gl.shadowMap.autoUpdate = false;
  gl.setRenderTarget(into);
  gl.render(scene, camera);
  camera.layers.mask = kept.layers;
  scene.background = kept.background;
  if (scene.fog instanceof FogExp2) scene.fog.density = kept.density;
  gl.shadowMap.autoUpdate = kept.shadows;
}

/**
 * Only ever adds light to the picture the canvas already holds: where nothing glows the frame is the one that was
 * drawn, antialiasing and fog-of-war veil included, and the ground and the fighters, which give no light, stay crisp
 * whatever the strength.
 */
export function createBloom(gl: WebGLRenderer): Bloom {
  const passes = createPasses();
  const quad = new FullScreenQuad(passes.bright);
  const sources = halfFloat(true);
  const shrunk = Array.from({ length: LEVELS }, () => halfFloat(false));
  const grown = Array.from({ length: LEVELS - 1 }, () => halfFloat(false));
  const size = new Vector2();
  const measured = new Vector2();

  const resize = (): void => {
    size.copy(measured);
    sources.setSize(Math.max(1, size.x >> 1), Math.max(1, size.y >> 1));
    [shrunk, grown].forEach((chain) => chain.forEach((target, level) => target.setSize(Math.max(1, size.x >> (level + 2)), Math.max(1, size.y >> (level + 2)))));
  };
  const draw = (material: ShaderMaterial, source: WebGLRenderTarget, into: WebGLRenderTarget | null): void => {
    const uniforms = material.uniforms as Record<string, { value: unknown }>;
    uniforms.source!.value = source.texture;
    if (uniforms.texel !== undefined) (uniforms.texel.value as Vector2).set(1 / source.width, 1 / source.height);
    quad.material = material;
    gl.setRenderTarget(into);
    quad.render(gl);
  };

  return {
    render(scene, camera, spec) {
      if (!gl.getDrawingBufferSize(measured).equals(size)) resize();
      passes.bright.uniforms.threshold!.value = spec.threshold;
      passes.grow.uniforms.spread!.value = spec.radius;
      passes.add.uniforms.strength!.value = spec.strength;
      drawSources(gl, scene, camera, sources);
      draw(passes.bright, sources, shrunk[0]!);
      for (let level = 1; level < LEVELS; level += 1) draw(passes.shrink, shrunk[level - 1]!, shrunk[level]!);
      let blurred = shrunk[LEVELS - 1]!;
      for (let level = LEVELS - 2; level >= 0; level -= 1) {
        passes.grow.uniforms.sharper!.value = shrunk[level]!.texture;
        draw(passes.grow, blurred, grown[level]!);
        blurred = grown[level]!;
      }
      const cleared = gl.autoClear;
      // The last pass adds to the picture; clearing first would leave only the glow.
      gl.autoClear = false;
      draw(passes.add, blurred, null);
      gl.autoClear = cleared;
    },
    dispose() {
      [sources, ...shrunk, ...grown].forEach((target) => target.dispose());
      Object.values(passes).forEach((material) => material.dispose());
      quad.dispose();
    },
  };
}
