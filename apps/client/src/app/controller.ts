import { createRoom, parseName, reduce, seatOf, toMatchConfig, upcomingScene } from '@hookbrawl/room';
import type { MemberId, RoomAction, RoomState } from '@hookbrawl/room';
import type { SessionSetup } from '../game/session';
import type { Backdrop } from '../render/backdrop';
import { playsIntro } from '../render/intro/intro';
import type { MatchView } from '../render/renderer';
import type { SceneId } from '../render/scenes/types';
import { createBackdropSlot } from './backdropSlot';
import { directRoom, matchSeed, sessionSetupFor, type PageOptions } from './matchSetup';
import type { MatchHandle } from './matchHost';
import type { NameStore } from './nameStore';
import type { Route, Router } from './route';
import { createStore, type Store } from './store';

/** A room action as the local player sends it; the controller says who is asking. */
export type LocalAction = RoomAction extends infer A ? (A extends RoomAction ? Omit<A, 'by'> : never) : never;

export type AppView = {
  readonly route: Route;
  readonly room: RoomState;
  readonly member: MemberId;
  /** The name last typed on the menu, as typed. */
  readonly name: string;
  readonly match: MatchHandle | null;
  /** A match is being set up; the boot panel says so. */
  readonly starting: boolean;
  /** Why the last thing asked of the app did not happen, in words for the player. */
  readonly notice: string | null;
};

export type App = Pick<Store<AppView>, 'subscribe' | 'getSnapshot'> & {
  /** Seats the local player under `name`, remembers it, and opens the lobby. Returns why a name was refused. */
  play(name: string): string | null;
  act(action: LocalAction): void;
  start(): void;
  rematch(): Promise<void>;
  leaveMatch(): void;
  leaveLobby(): void;
  closeCredits(): void;
};

export type AppDeps = {
  readonly router: Router;
  readonly names: NameStore;
  readonly page: PageOptions;
  readonly makeBackdrop: (scene: SceneId) => Promise<Backdrop>;
  /** `rematch` is what the dev hook's restart does. */
  readonly startMatch: (setup: SessionSetup, view: MatchView, rematch: () => Promise<void>) => Promise<MatchHandle>;
  /** Puts the keyboard on the game once a match is up. */
  readonly focusGame: () => void;
  /** Shown over the page while a match is set up, and hidden again. */
  readonly busy: (starting: boolean) => void;
};

const LOCAL = 'local' as MemberId;

const describe = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function createApp(deps: AppDeps): App {
  const { router, page } = deps;
  const store = createStore<AppView>({
    route: router.getRoute(),
    room: page.direct === null ? createRoom() : directRoom(page.direct, LOCAL),
    member: LOCAL,
    name: deps.names.load(),
    match: null,
    starting: page.direct !== null,
    notice: null,
  });
  const view = store.getSnapshot;
  const patch = (change: Partial<AppView>): void => store.update((v) => ({ ...v, ...change }));
  const dispatch = (action: LocalAction): void => patch({ room: reduce(view().room, { ...action, by: LOCAL } as RoomAction) });
  const backdrops = createBackdropSlot(
    deps.makeBackdrop,
    (error) => patch({ notice: `The scenery could not be drawn: ${describe(error)}` }),
  );
  let lastScene: SceneId | null = null;
  // Each launch takes a ticket; a launch whose ticket is stale finished after the player had moved on.
  let ticket = 0;

  const stopMatch = (): void => {
    ticket += 1;
    view().match?.destroy();
    deps.busy(false);
    patch({ match: null, starting: false });
    dispatch({ kind: 'endMatch' });
  };

  const failStart = (error: unknown): void => {
    stopMatch();
    patch({ notice: `The match could not start: ${describe(error)}` });
    router.backTo('lobby');
  };

  async function launch(): Promise<void> {
    const mine = ++ticket;
    patch({ starting: true, notice: null });
    deps.busy(true);
    try {
      const { room } = view();
      const plan = toMatchConfig(room, matchSeed(page.seed, room.matchesStarted));
      if (plan === null) throw new Error('both sides need at least one fighter.');
      const setup = sessionSetupFor(plan, LOCAL, page.overrides);
      await backdrops.show(null);
      const intro = playsIntro(page.intro, lastScene, plan.scene);
      const match = await deps.startMatch(setup, { scene: plan.scene, intro }, rematch);
      if (mine !== ticket) {
        match.destroy();
        return;
      }
      lastScene = plan.scene;
      patch({ match, starting: false });
      deps.focusGame();
    } catch (error) {
      if (mine === ticket) failStart(error);
    } finally {
      if (mine === ticket) deps.busy(false);
    }
  }

  function rematch(): Promise<void> {
    if (view().match === null) return Promise.resolve();
    stopMatch();
    dispatch({ kind: 'startMatch' });
    return launch();
  }

  /** Brings the page in line with the route: what the URL says is up is what runs. */
  function sync(): void {
    const route = router.getRoute();
    patch({ route });
    const { match, starting, room } = view();
    if (route.screen !== 'match' && (match !== null || starting)) stopMatch();
    if (route.screen === 'match' && match === null && !starting) return router.replace('lobby');
    if (route.screen === 'lobby' && seatOf(room, LOCAL) === null) {
      const parsed = parseName(view().name);
      if (!parsed.ok) return router.replace('menu');
      dispatch({ kind: 'join', name: parsed.name });
    }
    void backdrops.show(route.screen === 'match' ? null : upcomingScene(view().room));
  }

  router.subscribe(sync);
  if (page.direct !== null) void launch();
  sync();

  return {
    subscribe: store.subscribe,
    getSnapshot: store.getSnapshot,
    play(name) {
      const parsed = parseName(name);
      if (!parsed.ok) return parsed.error;
      deps.names.save(parsed.name);
      patch({ name: parsed.name, notice: null });
      dispatch(seatOf(view().room, LOCAL) === null ? { kind: 'join', name: parsed.name } : { kind: 'rename', name: parsed.name });
      router.push('lobby');
      return null;
    },
    act(action) {
      dispatch(action);
      if (action.kind === 'setScene') void backdrops.show(upcomingScene(view().room));
    },
    start() {
      dispatch({ kind: 'startMatch' });
      if (view().room.phase.kind !== 'in-match') return;
      patch({ starting: true });
      router.push('match');
      void launch();
    },
    rematch,
    leaveMatch: () => router.backTo('lobby'),
    leaveLobby: () => router.backTo('menu'),
    closeCredits: () => router.closeCredits(),
  };
}
