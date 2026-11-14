import type { Route, Router, Screen } from './route';

/** A router over an in-memory history, enough to drive the controller the way the browser would. */
export function fakeRouter(home: Screen) {
  const listeners = new Set<() => void>();
  let entries: Route[] = [{ screen: home, credits: false }];
  let at = 0;
  const go = (index: number): void => {
    at = index;
    listeners.forEach((l) => l());
  };
  const router: Router = {
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getRoute: () => entries[at]!,
    push(screen) {
      entries = [...entries.slice(0, at + 1), { screen, credits: false }];
      go(at + 1);
    },
    replace(screen) {
      entries = entries.map((e, i) => (i === at ? { screen, credits: false } : e));
      go(at);
    },
    backTo(screen) {
      if (entries[at - 1]?.screen === screen) go(at - 1);
      else router.replace(screen);
    },
    closeCredits: () => undefined,
  };
  return { router, back: () => go(at - 1), forward: () => go(at + 1) };
}
