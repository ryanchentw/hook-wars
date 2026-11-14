export type Route = 'game' | 'credits';

export const CREDITS_HASH = '#/credits';

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '').replace(/\/+$/, '').toLowerCase();
  return path === '/credits' ? 'credits' : 'game';
}

export type Router = {
  subscribe(onChange: () => void): () => void;
  getRoute(): Route;
  /** Leaves the credits route: pops the history entry the app pushed, or clears the hash on a direct visit. */
  closeCredits(): void;
};

export function createRouter(win: Window): Router {
  const listeners = new Set<() => void>();
  let route = parseRoute(win.location.hash);
  // A direct visit to the credits link has no game entry behind it, so going back would leave the site.
  let enteredFromGame = false;

  const set = (next: Route): void => {
    if (next === route) return;
    route = next;
    listeners.forEach((l) => l());
  };

  win.addEventListener('hashchange', (e) => {
    const next = parseRoute(win.location.hash);
    enteredFromGame = next === 'credits' && parseRoute(new URL(e.oldURL).hash) === 'game';
    set(next);
  });

  return {
    subscribe(onChange) {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    getRoute: () => route,
    closeCredits() {
      if (route !== 'credits') return;
      if (enteredFromGame) {
        win.history.back();
        return;
      }
      win.history.replaceState(win.history.state, '', win.location.pathname + win.location.search);
      set('game');
    },
  };
}
