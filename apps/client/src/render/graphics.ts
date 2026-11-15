import type { BufferGeometry, Texture } from 'three';
import { ACESFilmicToneMapping, PCFShadowMap, WebGLRenderer } from 'three';
import type { Assets } from './assets/loadAssets';
import { createHookGeometry } from './hook/hookGeometry';
import type { LookTap } from './lookTap';
import { createPipeline } from './post/pipeline';
import { createQualitySetting, type Capabilities } from './quality';
import type { ShowKit } from './sceneShow';
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
  readonly kit: ShowKit;
  dispose(): void;
};

function createWebGL(): WebGLRenderer {
  try {
    const gl = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    gl.toneMapping = ACESFilmicToneMapping;
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = PCFShadowMap;
    // A frame can be several renders; whoever draws it resets the counts once, at its start.
    gl.info.autoReset = false;
    return gl;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`This browser could not start WebGL, which Hook Wars needs to draw the match (${detail})`);
  }
}

function capabilitiesOf(gl: WebGLRenderer): Capabilities {
  const context = gl.getContext();
  const named = context.getExtension('WEBGL_debug_renderer_info');
  const renderer: unknown = context.getParameter(named === null ? context.RENDERER : named.UNMASKED_RENDERER_WEBGL);
  return { renderer: String(renderer), maxTextureSize: gl.capabilities.maxTextureSize, cores: navigator.hardwareConcurrency };
}

export type GraphicsOptions = {
  readonly storage: () => Storage;
  /** The quality the address asks for, if any. */
  readonly askedQuality: string | null;
  readonly tap: LookTap | null;
};

export function createGraphics(host: HTMLElement, assets: Assets, { storage, askedQuality, tap }: GraphicsOptions): Graphics {
  const gl = createWebGL();
  const pipeline = createPipeline(gl);
  const quality = createQualitySetting({ storage, asked: askedQuality, capabilities: capabilitiesOf(gl) });
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
    kit: { pipeline, quality, tap },
    dispose() {
      pipeline.dispose();
      softDot.dispose();
      hookGeometry.dispose();
      gl.dispose();
      surface.dispose();
    },
  };
}
