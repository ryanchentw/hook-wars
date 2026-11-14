import { createRoom, parseName, reduce, seatOf, toMatchConfig } from '@hookbrawl/room';
import type { RoomAction } from '@hookbrawl/room';
import { createCore, LOCAL, type AppDeps, type AppView, type LocalAction } from './appCore';
import { directRoom, matchSeed, sessionSetupFor } from './matchSetup';
import { createOnlineMode } from './onlineMode';
import { createStore, type Store } from './store';

export type { AppDeps, AppView, LocalAction } from './appCore';

export type App = Pick<Store<AppView>, 'subscribe' | 'getSnapshot'> & {
  /** Seats the local player under `name`, remembers it, and opens the lobby. Returns why a name was refused. */
  play(name: string): string | null;
  /** Opens a new room on the server. Returns why a name was refused; anything the server refuses arrives as a notice. */
  createRoom(name: string): string | null;
  joinRoom(name: string, code: string): string | null;
  act(action: LocalAction): void;
  start(): void;
  rematch(): Promise<void>;
  /** Leaves the match for the lobby. From an online match still being played, it leaves the room. */
  leaveMatch(): void;
  leaveLobby(): void;
  closeCredits(): void;
};

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
    online: null,
    connecting: false,
    invite: null,
  });
  const dispatch = (action: LocalAction): void => core.patch({ room: reduce(core.view().room, { ...action, by: LOCAL } as RoomAction) });
  const core = createCore(deps, store, { onFailedStart: () => online.active() || dispatch({ kind: 'endMatch' }), rematch });
  const { view, patch } = core;
  const online = createOnlineMode(core);

  const stopLocal = (): void => {
    core.stopMatch();
    dispatch({ kind: 'endMatch' });
  };

  const launchLocal = (): Promise<void> =>
    core.launch(() => {
      const { room } = view();
      const plan = toMatchConfig(room, matchSeed(page.seed, room.matchesStarted));
      if (plan === null) throw new Error('both sides need at least one fighter.');
      return { source: { kind: 'local', setup: sessionSetupFor(plan, LOCAL, page.overrides) }, scene: plan.scene, intro: core.wantsIntro(plan.scene) };
    });

  function rematch(): Promise<void> {
    if (online.active()) return Promise.resolve(online.start());
    if (view().match === null) return Promise.resolve();
    stopLocal();
    dispatch({ kind: 'startMatch' });
    return launchLocal();
  }

  /** Brings the page in line with the route: what the URL says is up is what runs. */
  function sync(): void {
    const route = router.getRoute();
    patch({ route });
    if (online.active()) return online.sync(route);
    const { match, starting, room } = view();
    if (route.screen !== 'match' && (match !== null || starting)) stopLocal();
    if (route.screen === 'match' && match === null && !starting) return router.replace('lobby');
    if (route.screen === 'lobby' && seatOf(room, LOCAL) === null) {
      const parsed = parseName(view().name);
      if (!parsed.ok) return router.replace('menu');
      dispatch({ kind: 'join', name: parsed.name });
    }
    core.showBackdrop();
  }

  /** Checks and remembers the name, then goes on with it. Returns why it was refused. */
  const named = (name: string, then: (name: string) => void): string | null => {
    const parsed = parseName(name);
    if (!parsed.ok) return parsed.error;
    deps.names.save(parsed.name);
    patch({ name: parsed.name, notice: null });
    then(parsed.name);
    return null;
  };

  router.subscribe(sync);
  if (page.direct !== null) void launchLocal();
  else online.open();
  sync();

  return {
    subscribe: store.subscribe,
    getSnapshot: store.getSnapshot,
    play: (name) =>
      named(name, (checked) => {
        dispatch(seatOf(view().room, LOCAL) === null ? { kind: 'join', name: checked } : { kind: 'rename', name: checked });
        router.push('lobby');
      }),
    createRoom: (name) => named(name, (checked) => online.enter(checked, { kind: 'create' })),
    joinRoom: (name, code) => named(name, (checked) => online.join(checked, code)),
    act(action) {
      if (online.active()) return online.act(action);
      dispatch(action);
      if (action.kind === 'setScene') core.showBackdrop();
    },
    start() {
      if (online.active()) return online.start();
      dispatch({ kind: 'startMatch' });
      if (view().room.phase.kind !== 'in-match') return;
      patch({ starting: true });
      router.push('match');
      void launchLocal();
    },
    rematch,
    leaveMatch: () => (online.active() ? online.leaveMatch() : router.backTo('lobby')),
    leaveLobby: () => router.backTo('menu'),
    closeCredits: () => router.closeCredits(),
  };
}
