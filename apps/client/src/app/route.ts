export type Screen = 'menu' | 'lobby' | 'match';

/** The screen on show, and whether the credits sit over it. */
export type Route = { readonly screen: Screen; readonly credits: boolean };

export const CREDITS_HASH = '#/credits';
const SCREEN_HASH: Readonly<Record<Screen, string>> = { menu: '#/', lobby: '#/lobby', match: '#/match' };

/** What a hash names. An empty or unknown one is home: the menu, or the match a test address asks for. */
export type Place = { readonly kind: 'screen'; readonly screen: Screen } | { readonly kind: 'credits' } | { readonly kind: 'home' };

export function parseHash(hash: string): Place {
  const path = hash.replace(/^#/, '').toLowerCase();
  if (path === '/') return { kind: 'screen', screen: 'menu' };
  const trimmed = path.replace(/\/+$/, '');
  if (trimmed === '/credits') return { kind: 'credits' };
  if (trimmed === '/lobby') return { kind: 'screen', screen: 'lobby' };
  if (trimmed === '/match') return { kind: 'screen', screen: 'match' };
  return { kind: 'home' };
}

/** The route a hash leads to, given the route it was reached from: the credits keep the screen under them. */
export function routeFor(place: Place, from: Route | null, home: Screen): Route {
  if (place.kind === 'credits') return { screen: from?.screen ?? home, credits: true };
  return { screen: place.kind === 'home' ? home : place.screen, credits: false };
}

export type Router = {
  subscribe(onChange: () => void): () => void;
  getRoute(): Route;
  /** Opens a screen on a new history entry, so Back returns to the one before. */
  push(screen: Screen): void;
  /** Shows a screen in place of the current entry. */
  replace(screen: Screen): void;
  /** Returns to `screen`: pops the entry the app pushed on top of it, or replaces when there is none, as on a direct visit. */
  backTo(screen: Screen): void;
  /** Leaves the credits: pops the history entry that opened them, or clears the hash on a direct visit. */
  closeCredits(): void;
};

type Pushed = { readonly below: Screen };

const isPushed = (state: unknown): state is Pushed => typeof state === 'object' && state !== null && 'below' in state;

/** The page's one router: the URL hash says which screen is up, so the browser's Back and Forward move between them. */
export function createRouter(win: Window, home: Screen): Router {
  const listeners = new Set<() => void>();
  let route = routeFor(parseHash(win.location.hash), null, home);
  // A direct visit to the credits link has no screen entry behind it, so going back would leave the site.
  let creditsOverScreen = false;

  const set = (next: Route): void => {
    if (next.screen === route.screen && next.credits === route.credits) return;
    route = next;
    listeners.forEach((l) => l());
  };
  const address = (screen: Screen): string => win.location.pathname + win.location.search + SCREEN_HASH[screen];

  win.addEventListener('hashchange', (e) => {
    const place = parseHash(win.location.hash);
    creditsOverScreen = place.kind === 'credits' && parseHash(new URL(e.oldURL).hash).kind !== 'credits';
    set(routeFor(place, route, home));
  });

  return {
    subscribe(onChange) {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    getRoute: () => route,
    push(screen) {
      win.history.pushState({ below: route.screen } satisfies Pushed, '', address(screen));
      set({ screen, credits: false });
    },
    replace(screen) {
      win.history.replaceState(win.history.state, '', address(screen));
      set({ screen, credits: false });
    },
    backTo(screen) {
      const state: unknown = win.history.state;
      if (!route.credits && isPushed(state) && state.below === screen) {
        win.history.back();
        return;
      }
      win.history.replaceState(null, '', address(screen));
      set({ screen, credits: false });
    },
    closeCredits() {
      if (!route.credits) return;
      if (creditsOverScreen) {
        win.history.back();
        return;
      }
      win.history.replaceState(win.history.state, '', win.location.pathname + win.location.search);
      set({ screen: route.screen, credits: false });
    },
  };
}
