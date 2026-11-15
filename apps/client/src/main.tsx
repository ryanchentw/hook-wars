// First, so the setting is in place before any schema is built.
import '@hookbrawl/protocol/browser';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { createApp } from './app/controller';
import { startMatch } from './app/matchHost';
import { pageOptionsFromQuery } from './app/matchSetup';
import { createNameStore } from './app/nameStore';
import { browserOnline } from './app/onlineSetup';
import { createRouter } from './app/route';
import { createBootScreen } from './boot/bootScreen';
import { loadAssets } from './render/assets/loadAssets';
import { createBackdrop } from './render/backdrop';
import { createGraphics } from './render/graphics';

const ASSET_BASE = `${import.meta.env.BASE_URL}assets/kaykit/`;

function mountPoint(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`Missing #${id} in index.html`);
  return el;
}

const stage = mountPoint('stage');
const boot = createBootScreen(mountPoint('boot'));
const hud = mountPoint('hud');

/** Models load once for the whole visit; every match and the menu's scenery draw with them. */
async function start(): Promise<void> {
  stage.dataset.state = 'loading';
  const assets = await loadAssets(ASSET_BASE, boot.showLoading);
  const graphics = createGraphics(stage, assets);
  const page = pageOptionsFromQuery(window.location.search, Date.now());
  try {
    const router = createRouter(window, page.direct === null ? 'menu' : 'match');
    const context = {
      onContextLost: () => boot.showNotice('The graphics context was lost. Waiting for the browser to restore it…'),
      onContextRestored: boot.hide,
    };
    const app = createApp({
      router,
      page,
      names: createNameStore(() => window.localStorage),
      makeBackdrop: (scene) => createBackdrop(graphics, scene, context),
      startMatch: (source, view, rematch) => startMatch({ graphics, source, view, router, hudElement: hud, context, rematch }),
      online: browserOnline(window),
      focusGame: () => stage.focus(),
      busy(starting) {
        stage.dataset.state = starting ? 'starting' : 'ready';
        if (starting) boot.showNotice('Setting the scene…');
        else boot.hide();
      },
    });
    createRoot(hud).render(<App app={app} />);
  } catch (error) {
    // Leave nothing half-started behind, so "Try again" begins from a clean page.
    graphics.dispose();
    throw error;
  }
  if (page.direct === null) {
    boot.hide();
    stage.dataset.state = 'ready';
  }
}

function run(): void {
  start().catch((error: unknown) => {
    stage.dataset.state = 'error';
    boot.showError(error instanceof Error ? error.message : String(error), run);
  });
}

run();
