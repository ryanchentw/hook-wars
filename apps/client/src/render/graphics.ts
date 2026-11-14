import type { BufferGeometry, Texture } from 'three';
import { ACESFilmicToneMapping, PCFShadowMap, WebGLRenderer } from 'three';
import type { Assets } from './assets/loadAssets';
import { createHookGeometry } from './hook/hookGeometry';
import { createSurface, type Surface } from './surface';
import { createSoftDot } from './textures';

/**
 * What every picture on the page draws with, made once: one WebGL context for the whole visit, so a new match or a
 * trip back to the menu never costs a context, and whatever a match leaves on the GPU shows up in one set of counts.
 */
export type Graphics = {
  readonly gl: WebGLRenderer;
  readonly surface: Surface;
  readonly host: HTMLElement;
  readonly assets: Assets;
  readonly softDot: Texture;
  readonly hookGeometry: BufferGeometry;
  dispose(): void;
};

function createWebGL(): WebGLRenderer {
  try {
    const gl = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    gl.toneMapping = ACESFilmicToneMapping;
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = PCFShadowMap;
    return gl;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`This browser could not start WebGL, which Hook Wars needs to draw the match (${detail})`);
  }
}

export function createGraphics(host: HTMLElement, assets: Assets): Graphics {
  const gl = createWebGL();
  const surface = createSurface(host, gl);
  const softDot = createSoftDot();
  const hookGeometry = createHookGeometry();
  return {
    gl,
    surface,
    host,
    assets,
    softDot,
    hookGeometry,
    dispose() {
      softDot.dispose();
      hookGeometry.dispose();
      gl.dispose();
      surface.dispose();
    },
  };
}
