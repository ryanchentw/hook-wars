import { createRoot } from 'react-dom/client';
import * as sim from '@hookbrawl/sim';
import { installDevHook } from './devHook';
import { bindInput } from './game/input';
import { createM1Setup, optionsFromQuery } from './game/matchSetup';
import { createSession } from './game/session';
import { Hud } from './hud/Hud';
import { createHudStore } from './hud/hudStore';
import { screenToWorld } from './render/camera';
import { createRenderer } from './render/renderer';

function mountPoint(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`Missing #${id} in index.html`);
  return el;
}

async function boot(): Promise<void> {
  const session = createSession(sim, createM1Setup(optionsFromQuery(window.location.search, Date.now())));
  const renderer = await createRenderer(mountPoint('stage'), session);
  bindInput({
    target: renderer.canvas,
    playerId: session.localPlayerId,
    toWorld: (p) => screenToWorld(renderer.camera(), p),
    send: (input) => session.queueInput(input),
  });
  createRoot(mountPoint('hud')).render(<Hud store={createHudStore(session)} />);
  if (import.meta.env.DEV) installDevHook(session, renderer);
}

boot().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const hud = document.getElementById('hud');
  if (hud !== null) {
    hud.textContent = `Hook Brawl failed to start: ${message}`;
    hud.className = 'boot-error';
  }
  console.error(error);
});
