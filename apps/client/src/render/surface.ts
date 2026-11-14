import type { WebGLRenderer } from 'three';
import type { Viewport } from './camera/framing';

export type Surface = {
  readonly canvas: HTMLCanvasElement;
  /** Sits over the canvas for the DOM that follows the world: names, bars, numbers, the title card. */
  readonly overlay: HTMLElement;
  viewport(): Viewport;
  dispose(): void;
};

const MAX_PIXEL_RATIO = 2;

/** Puts the canvas and its overlay in the host and keeps the drawing buffer the size of the host. */
export function createSurface(host: HTMLElement, gl: WebGLRenderer): Surface {
  const canvas = gl.domElement;
  const overlay = document.createElement('div');
  overlay.className = 'world-overlay';
  host.append(canvas, overlay);
  let viewport: Viewport = { width: 1, height: 1 };

  const resize = (): void => {
    viewport = { width: Math.max(1, host.clientWidth), height: Math.max(1, host.clientHeight) };
    gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    gl.setSize(viewport.width, viewport.height);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  return {
    canvas,
    overlay,
    viewport: () => viewport,
    dispose() {
      observer.disconnect();
      canvas.remove();
      overlay.remove();
    },
  };
}
