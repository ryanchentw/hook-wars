const PREFIX = 'hookwars.room.';

/**
 * The rejoin token for each room, kept for this tab only: a reload gets the seat back, a second tab is a second
 * player, and nothing outlives the tab. Storage can be blocked; then a drop simply cannot be rejoined after a reload.
 */
export type TokenStore = { load(code: string): string | null; save(code: string, token: string): void; forget(code: string): void };

export function createTokenStore(storage: () => Storage): TokenStore {
  const attempt = <T>(run: (store: Storage) => T, fallback: T): T => {
    try {
      return run(storage());
    } catch {
      return fallback;
    }
  };
  return {
    load: (code) => attempt((store) => store.getItem(PREFIX + code), null),
    save: (code, token) => attempt((store) => store.setItem(PREFIX + code, token), undefined),
    forget: (code) => attempt((store) => store.removeItem(PREFIX + code), undefined),
  };
}
