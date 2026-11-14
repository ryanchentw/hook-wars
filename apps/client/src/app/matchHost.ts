import * as sim from '@hookbrawl/sim';
import { installDevHook } from '../devHook';
import { facingAim } from '../game/bindings';
import { bindInput } from '../game/input';
import { bindIntroSkip } from '../game/introSkip';
import { bindMatchKeys } from '../game/matchKeys';
import { createPauseGate, type PauseGate } from '../game/pauseGate';
import { createSession, type Session, type SessionSetup } from '../game/session';
import { createHudStore, type HudStore } from '../hud/hudStore';
import type { ContextEvents } from '../render/frameLoop';
import type { Graphics } from '../render/graphics';
import { createRenderer, type MatchView, type Renderer } from '../render/renderer';
import type { Router } from './route';
import { createStore, type Store } from './store';

/** The overlays a match can open over itself. */
export type MatchUi = { readonly scores: boolean; readonly paused: boolean };

export type MatchHandle = {
  readonly session: Session;
  readonly renderer: Renderer;
  readonly hud: HudStore;
  readonly ui: Store<MatchUi>;
  setPaused(paused: boolean): void;
  setScores(shown: boolean): void;
  destroy(): void;
};

export type MatchDeps = {
  readonly graphics: Graphics;
  readonly setup: SessionSetup;
  readonly view: MatchView;
  readonly router: Router;
  /** Faded out while the establishing shot plays: the plates would sit on top of the landmark the shot is there to show. */
  readonly hudElement: HTMLElement;
  readonly context: ContextEvents;
  /** What the dev hook's `restart` does: a rematch, as the end panel offers. */
  readonly rematch: () => Promise<void>;
};

type Controls = { readonly ui: Store<MatchUi>; setPaused(paused: boolean): void; unbind(): void };

/** The keys and pointer of one match, and the overlays they open; every switch here reads the state it needs when asked. */
function bindControls(deps: MatchDeps, session: Session, renderer: Renderer, hud: HudStore, pause: PauseGate): Controls {
  const { router } = deps;
  const ui = createStore<MatchUi>({ scores: false, paused: false });
  const ended = (): boolean => session.getView().phase.kind === 'ended';
  const credits = (): boolean => router.getRoute().credits;
  const free = (): boolean => !credits() && !ui.getSnapshot().paused;
  const playing = (): boolean => free() && !renderer.introActive();
  const setPaused = (paused: boolean): void => {
    pause.set('menu', paused);
    ui.update((u) => (u.paused === paused ? u : { scores: false, paused }));
  };
  const syncCredits = (): void => pause.set('credits', credits());
  syncCredits();
  const unbinders = [
    router.subscribe(syncCredits),
    bindInput({
      target: renderer.canvas,
      window,
      document,
      playerId: session.localPlayerId,
      toWorld: renderer.screenToWorld,
      fallbackAim: () => {
        const local = session.getView().players.find((p) => p.id === session.localPlayerId);
        return local === undefined ? null : facingAim(local);
      },
      enabled: playing,
      send: (input) => session.queueInput(input),
      buy: (purchase) => hud.buy(purchase),
      steer: (dir) => session.setSteer(dir),
    }),
    bindIntroSkip({ window, skippable: () => free() && renderer.introActive(), skip: renderer.skipIntro }),
    bindMatchKeys({
      window,
      canPause: () => playing() && !ended(),
      pause: () => setPaused(true),
      tabShowsScores: () => free() && !ended(),
      showScores: (scores) => ui.update((u) => (u.scores === scores ? u : { ...u, scores })),
    }),
  ];
  return { ui, setPaused, unbind: () => unbinders.forEach((unbind) => unbind()) };
}

/**
 * Starts one match on the shared graphics: its session, its picture and its controls. Everything it makes, `destroy`
 * takes down again, so the page after a match holds what it held before it.
 */
export async function startMatch(deps: MatchDeps): Promise<MatchHandle> {
  const session = createSession(sim, deps.setup);
  const pause = createPauseGate(session.setPaused);
  const renderer = await createRenderer(deps.graphics, session, deps.view, {
    ...deps.context,
    onIntro: (active) => {
      pause.set('intro', active);
      deps.hudElement.classList.toggle('is-intro', active);
    },
  });
  try {
    const hud = createHudStore(session);
    const controls = bindControls(deps, session, renderer, hud, pause);
    const devHook = import.meta.env.DEV ? installDevHook(session, renderer, deps.rematch) : null;
    return {
      session,
      renderer,
      hud,
      ui: controls.ui,
      setPaused: controls.setPaused,
      setScores: (scores) => controls.ui.update((u) => (u.scores === scores ? u : { ...u, scores })),
      destroy() {
        devHook?.uninstall();
        controls.unbind();
        renderer.destroy();
        deps.hudElement.classList.remove('is-intro');
      },
    };
  } catch (error) {
    renderer.destroy();
    deps.hudElement.classList.remove('is-intro');
    throw error;
  }
}
