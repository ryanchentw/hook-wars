import { upcomingScene } from '@hookwars/room';
import type { MemberId, RoomAction, RoomState } from '@hookwars/room';
import type { Backdrop } from '../render/backdrop';
import { playsIntro } from '../render/intro/intro';
import type { MatchView } from '../render/renderer';
import type { SceneId } from '../render/scenes/types';
import { createBackdropSlot } from './backdropSlot';
import type { MatchHandle, MatchSource } from './matchHost';
import type { PageOptions } from './matchSetup';
import type { NameStore } from './nameStore';
import type { Invite, OnlineView } from './onlineMode';
import type { OnlineDeps } from './onlineRoom';
import type { Route, Router } from './route';
import type { Store } from './store';

/** A room action as the local player sends it; the controller, or the server, says who is asking. */
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
  /** The room on the server this page is in, or null when playing offline. */
  readonly online: OnlineView | null;
  /** A room on the server has been asked for and has not answered yet. */
  readonly connecting: boolean;
  /** A room the menu offers to join: one a friend's link named, or one this player was dropped from. */
  readonly invite: Invite | null;
};

export type AppDeps = {
  readonly router: Router;
  readonly names: NameStore;
  readonly page: PageOptions;
  readonly makeBackdrop: (scene: SceneId) => Promise<Backdrop>;
  /** `rematch` is what the dev hook's restart does. */
  readonly startMatch: (source: MatchSource, view: MatchView, rematch: () => Promise<void>) => Promise<MatchHandle>;
  /** Puts the keyboard on the game once a match is up. */
  readonly focusGame: () => void;
  /** Shown over the page while a match is set up, and hidden again. */
  readonly busy: (starting: boolean) => void;
  /** How rooms on a server are reached. Without it the app is offline only. */
  readonly online?: OnlineDeps;
};

/** What a launch needs once the page is ready for it. Throws, in words for the player, when the match cannot be made. */
export type Launch = () => { readonly source: MatchSource; readonly scene: SceneId; readonly intro: boolean };

/** The part of the app both ways of playing share: the one view, the one match on show, and the route. */
export type AppCore = {
  readonly deps: AppDeps;
  readonly view: () => AppView;
  readonly patch: (change: Partial<AppView>) => void;
  readonly launch: (prepare: Launch) => Promise<void>;
  /** Takes the match on show down, if there is one, and forgets any still starting. */
  readonly stopMatch: () => void;
  readonly showBackdrop: () => void;
  /** Whether a match in this scene should open on its establishing shot. */
  readonly wantsIntro: (scene: SceneId) => boolean;
};

export const LOCAL = 'local' as MemberId;

const describe = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** What the core asks of whoever owns the room: `rematch` is what the dev hook's restart does. */
export type CoreHooks = { readonly onFailedStart: () => void; readonly rematch: () => Promise<void> };

export function createCore(deps: AppDeps, store: Store<AppView>, hooks: CoreHooks): AppCore {
  const { router, page } = deps;
  const view = store.getSnapshot;
  const patch = (change: Partial<AppView>): void => store.update((v) => ({ ...v, ...change }));
  const backdrops = createBackdropSlot(deps.makeBackdrop, (error) => patch({ notice: `The scenery could not be drawn: ${describe(error)}` }));
  let lastScene: SceneId | null = null;
  // Each launch takes a ticket; a launch whose ticket is stale finished after the player had moved on.
  let ticket = 0;

  const stopMatch = (): void => {
    ticket += 1;
    view().match?.destroy();
    deps.busy(false);
    patch({ match: null, starting: false });
  };

  async function launch(prepare: Launch): Promise<void> {
    const mine = ++ticket;
    patch({ starting: true, notice: null });
    deps.busy(true);
    try {
      const { source, scene, intro } = prepare();
      await backdrops.show(null);
      const match = await deps.startMatch(source, { scene, intro }, hooks.rematch);
      if (mine !== ticket) return match.destroy();
      lastScene = scene;
      patch({ match, starting: false });
      deps.focusGame();
    } catch (error) {
      if (mine !== ticket) return;
      stopMatch();
      hooks.onFailedStart();
      patch({ notice: `The match could not start: ${describe(error)}` });
      router.backTo('lobby');
    } finally {
      if (mine === ticket) deps.busy(false);
    }
  }

  return {
    deps,
    view,
    patch,
    launch,
    stopMatch,
    showBackdrop: () => void backdrops.show(router.getRoute().screen === 'match' ? null : upcomingScene(view().room)),
    wantsIntro: (scene) => playsIntro(page.intro, lastScene, scene),
  };
}
