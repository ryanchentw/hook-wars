import * as sim from '@hookwars/sim';
import { bubblesAt } from '../chat/bubbles';
import { createChannelMemory } from '../chat/channelMemory';
import { createLocalChat, type ChatFeed } from '../chat/chatFeed';
import { bindChatKey, createMatchChat, type MatchChat } from '../chat/matchChat';
import { installDevHook } from '../devHook';
import { facingAim } from '../game/bindings';
import { bindInput } from '../game/input';
import { bindIntroSkip } from '../game/introSkip';
import { bindMatchKeys } from '../game/matchKeys';
import { createPauseGate, HOLDS_MATCH, HOLDS_ONLINE, type Holds, type PauseGate } from '../game/pauseGate';
import { createSession, type Session, type SessionSetup } from '../game/session';
import type { MatchStart } from '@hookwars/protocol';
import type { PlayerName } from '@hookwars/room';
import { createNetSession, type NetLink, type NetSession } from '../net/netSession';
import { createHudStore, type HudStore } from '../hud/hudStore';
import type { ContextEvents } from '../render/frameLoop';
import type { Graphics } from '../render/graphics';
import { createRenderer, type MatchView, type Renderer } from '../render/renderer';
import { LOCAL } from './appCore';
import type { Router } from './route';
import { createStore, type Store } from './store';

/** The overlays a match can open over itself. `leaving` is the question asked before an online match is left. */
export type MatchUi = { readonly scores: boolean; readonly paused: boolean; readonly leaving: boolean };

/** Where a match is run: here, from a setup, or on the server, which has already started it. */
export type MatchSource =
  | { readonly kind: 'local'; readonly setup: SessionSetup }
  | { readonly kind: 'online'; readonly start: MatchStart; readonly link: NetLink; readonly chat: ChatFeed };

export type MatchHandle = {
  readonly session: Session;
  readonly renderer: Renderer;
  readonly hud: HudStore;
  readonly ui: Store<MatchUi>;
  readonly chat: MatchChat;
  readonly online: boolean;
  /** Null for a local match; an online one is told apart from its rematch by this. */
  readonly matchId: number | null;
  /** Whether the open menu stops the match, which is what the menu tells the player. */
  readonly holds: Holds;
  setPaused(paused: boolean): void;
  setScores(shown: boolean): void;
  setLeaving(asking: boolean): void;
  /** The connection came back while this match was showing. */
  resume(): void;
  destroy(): void;
};

export type MatchDeps = {
  readonly graphics: Graphics;
  readonly source: MatchSource;
  readonly view: MatchView;
  readonly router: Router;
  /** Faded out while the establishing shot plays: the plates would sit on top of the landmark the shot is there to show. */
  readonly hudElement: HTMLElement;
  readonly context: ContextEvents;
  /** What the dev hook's `restart` does: a rematch, as the end panel offers. */
  readonly rematch: () => Promise<void>;
  /** Gives the keyboard back to the game, as when the chat input closes. */
  readonly focusGame: () => void;
};

const MS_PER_SECOND = 1000;
const channelMemory = createChannelMemory(() => window.localStorage);

type Controls = { readonly ui: Store<MatchUi>; readonly chat: MatchChat; setPaused(paused: boolean): void; setLeaving(asking: boolean): void; unbind(): void };

/** The keys and pointer of one match, and the overlays they open; every switch here reads the state it needs when asked. */
function bindControls(deps: MatchDeps, session: Session, renderer: Renderer, hud: HudStore, pause: PauseGate, feed: ChatFeed): Controls {
  const { router } = deps;
  const ui = createStore<MatchUi>({ scores: false, paused: false, leaving: false });
  const ended = (): boolean => session.getView().phase.kind === 'ended';
  const credits = (): boolean => router.getRoute().credits;
  const shown = (): boolean => !credits() && !ui.getSnapshot().paused && !ui.getSnapshot().leaving;
  // Typing takes every game key: the fighter stands still, and Tab and Escape are the chat's.
  const free = (): boolean => shown() && !chat.isOpen();
  const playing = (): boolean => free() && !renderer.introActive();
  const setPaused = (paused: boolean): void => {
    pause.set('menu', paused);
    ui.update((u) => (u.paused === paused ? u : { scores: false, paused, leaving: false }));
  };
  const setLeaving = (leaving: boolean): void => {
    pause.set('menu', false);
    ui.update((u) => (u.leaving === leaving && !u.paused ? u : { scores: false, paused: false, leaving }));
  };
  const syncCredits = (): void => pause.set('credits', credits());
  syncCredits();
  const input = bindInput({
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
  });
  const chat = createMatchChat({ feed, memory: channelMemory, release: input.releaseAll, focusGame: deps.focusGame });
  const unbinders = [
    router.subscribe(syncCredits),
    input.unbind,
    bindChatKey({ window, canOpen: () => shown() && !renderer.introActive(), open: chat.open }),
    bindIntroSkip({ window, skippable: () => free() && renderer.introActive(), skip: renderer.skipIntro }),
    bindMatchKeys({
      window,
      canPause: () => playing() && !ended(),
      pause: () => setPaused(true),
      tabShowsScores: () => free() && !ended(),
      showScores: (scores) => ui.update((u) => (u.scores === scores ? u : { ...u, scores })),
    }),
  ];
  return { ui, chat, setPaused, setLeaving, unbind: () => unbinders.forEach((unbind) => unbind()) };
}

/**
 * Starts one match on the shared graphics: its session, its picture and its controls. Everything it makes, `destroy`
 * takes down again, so the page after a match holds what it held before it.
 */
function openSession(source: MatchSource): { readonly session: Session; readonly net: NetSession | null; readonly chat: ChatFeed } {
  const now = (): number => performance.now();
  if (source.kind === 'online') {
    const net = createNetSession({ link: source.link, start: source.start, now: () => now() / MS_PER_SECOND });
    return { session: net, net, chat: source.chat };
  }
  const session = createSession(sim, source.setup);
  const speaker = () => ({
    from: LOCAL,
    // The roster holds the name the lobby already checked.
    name: (session.getView().roster.find((p) => p.id === session.localPlayerId)?.name ?? '') as PlayerName,
    team: session.localTeam,
    fighter: session.localPlayerId,
  });
  return { session, net: null, chat: createLocalChat(speaker, now) };
}

export async function startMatch(deps: MatchDeps): Promise<MatchHandle> {
  const { session, net, chat } = openSession(deps.source);
  const holds = net === null ? HOLDS_MATCH : HOLDS_ONLINE;
  const pause = createPauseGate(session.setPaused, holds);
  const release = (): void => {
    net?.dispose();
    deps.hudElement.classList.remove('is-intro');
  };
  const bubbles = (visible: ReadonlySet<sim.PlayerId>) => bubblesAt(chat.getSnapshot().entries, performance.now(), visible);
  const renderer = await createRenderer(deps.graphics, session, { ...deps.view, bubbles }, {
    ...deps.context,
    onIntro: (active) => {
      pause.set('intro', active);
      deps.hudElement.classList.toggle('is-intro', active);
    },
  }).catch((error: unknown) => {
    release();
    throw error;
  });
  try {
    const hud = createHudStore(session);
    const controls = bindControls(deps, session, renderer, hud, pause, chat);
    const devHook = import.meta.env.DEV ? installDevHook(session, renderer, deps.rematch) : null;
    return {
      session,
      renderer,
      hud,
      ui: controls.ui,
      chat: controls.chat,
      online: net !== null,
      matchId: net?.matchId ?? null,
      holds,
      setPaused: controls.setPaused,
      setLeaving: controls.setLeaving,
      resume: () => net?.resume(),
      setScores: (scores) => controls.ui.update((u) => (u.scores === scores ? u : { ...u, scores })),
      destroy() {
        devHook?.uninstall();
        controls.unbind();
        renderer.destroy();
        release();
      },
    };
  } catch (error) {
    renderer.destroy();
    release();
    throw error;
  }
}
