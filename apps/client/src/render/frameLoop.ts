export type FrameLoop = {
  start(): void;
  stop(): void;
  /** While held nothing advances and nothing is redrawn, so the last frame stays on the canvas. */
  setHeld(held: boolean): void;
};

export type ContextEvents = { readonly onContextLost: () => void; readonly onContextRestored: () => void };

const MS_PER_SECOND = 1000;
// A tab that was hidden comes back with one huge frame; treat it as a short one.
const MAX_FRAME_SECONDS = 0.1;

/** Calls `onFrame` once per animation frame with the seconds since the last, and holds off while the WebGL context is lost. */
export function createFrameLoop(canvas: HTMLCanvasElement, events: ContextEvents, onFrame: (dt: number) => void): FrameLoop {
  let last: number | null = null;
  let contextLost = false;
  let held = false;
  let raf = 0;

  const tick = (now: number): void => {
    raf = requestAnimationFrame(tick);
    const dt = last === null ? 0 : Math.min(MAX_FRAME_SECONDS, Math.max(0, (now - last) / MS_PER_SECOND));
    last = now;
    if (!contextLost && !held) onFrame(dt);
  };
  const onLost = (event: Event): void => {
    // Without this the browser never offers the context back.
    event.preventDefault();
    contextLost = true;
    events.onContextLost();
  };
  const onRestored = (): void => {
    contextLost = false;
    last = null;
    events.onContextRestored();
  };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);

  return {
    start() {
      raf = requestAnimationFrame(tick);
    },
    setHeld(next) {
      held = next;
      // Time that passed while held is not owed to anyone.
      last = null;
    },
    stop() {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
    },
  };
}
