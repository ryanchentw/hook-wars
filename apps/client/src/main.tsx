import { createRoot } from 'react-dom/client';
import * as sim from '@hookbrawl/sim';
import { createBootScreen } from './boot/bootScreen';
import { createRouter } from './credits/route';
import { installDevHook } from './devHook';
import { facingAim } from './game/bindings';
import { bindInput } from './game/input';
import { bindIntroSkip } from './game/introSkip';
import { createMatchSetup, optionsFromQuery } from './game/matchSetup';
import { createPauseGate } from './game/pauseGate';
import { createSession } from './game/session';
import { Hud } from './hud/Hud';
import { createHudStore } from './hud/hudStore';
import { loadAssets } from './render/assets/loadAssets';
import { createRenderer } from './render/renderer';
import { viewOptionsFromQuery } from './render/scenes/choice';

const ASSET_BASE = `${import.meta.env.BASE_URL}assets/kaykit/`;

function mountPoint(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`Missing #${id} in index.html`);
  return el;
}

const stage = mountPoint('stage');
const boot = createBootScreen(mountPoint('boot'));
const hud = mountPoint('hud');

/** The match is only created once every model is in, so the sim cannot tick behind the loading screen. */
async function start(): Promise<void> {
  stage.dataset.state = 'loading';
  const assets = await loadAssets(ASSET_BASE, boot.showLoading);
  const session = createSession(sim, createMatchSetup(optionsFromQuery(window.location.search, Date.now())));
  boot.showNotice('Setting the scene…');
  const pause = createPauseGate(session.setPaused);
  const renderer = await createRenderer(stage, session, assets, viewOptionsFromQuery(window.location.search), {
    onContextLost: () => boot.showNotice('The graphics context was lost. Waiting for the browser to restore it…'),
    onContextRestored: boot.hide,
    onIntro(active) {
      pause.set('intro', active);
      // The plates would sit on top of the landmark the shot is there to show.
      hud.classList.toggle('is-intro', active);
    },
  });
  const router = createRouter(window);
  const playing = (): boolean => router.getRoute() === 'game' && !renderer.introActive();
  const hudStore = createHudStore(session);
  const unbindInput = bindInput({
    target: renderer.canvas,
    window,
    document,
    playerId: session.localPlayerId,
    toWorld: renderer.screenToWorld,
    fallbackAim: () => {
      const local = session.getState().players.find((p) => p.id === session.localPlayerId);
      return local === undefined ? null : facingAim(local);
    },
    enabled: playing,
    send: (input) => session.queueInput(input),
    buy: (purchase) => hudStore.buy(purchase),
    steer: (dir) => session.setSteer(dir),
  });
  const unbindSkip = bindIntroSkip({
    window,
    skippable: () => router.getRoute() === 'game' && renderer.introActive(),
    skip: renderer.skipIntro,
  });
  try {
    const syncPause = (): void => pause.set('credits', router.getRoute() === 'credits');
    syncPause();
    router.subscribe(syncPause);
    createRoot(hud).render(<Hud store={hudStore} router={router} />);
    if (import.meta.env.DEV) installDevHook(session, renderer);
  } catch (error) {
    // Leave nothing half-started behind, so "Try again" begins from a clean page.
    unbindInput();
    unbindSkip();
    renderer.destroy();
    throw error;
  }
  boot.hide();
  stage.dataset.state = 'ready';
}

function run(): void {
  start().catch((error: unknown) => {
    stage.dataset.state = 'error';
    console.error(error);
    boot.showError(error instanceof Error ? error.message : String(error), run);
  });
}

run();
