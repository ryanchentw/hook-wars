const KEY = 'hookwars.name';

/** Remembers the name typed on the menu. Storage can be blocked or full, and a forgotten name is only a convenience lost. */
export type NameStore = { load(): string; save(name: string): void };

export function createNameStore(storage: () => Storage): NameStore {
  return {
    load() {
      try {
        return storage().getItem(KEY) ?? '';
      } catch {
        return '';
      }
    },
    save(name) {
      try {
        storage().setItem(KEY, name);
      } catch {
        // Nothing to tell the player: the name still works for this visit, it is just not remembered.
      }
    },
  };
}
