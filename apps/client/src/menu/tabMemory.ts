import { parseMenuTab, type MenuTab } from './menuChoice';

const KEY = 'hookwars.menuTab';

/** Remembers which way to play was used last. Storage can be blocked or full; forgetting only costs one press. */
export type TabMemory = { load(): MenuTab | null; save(tab: MenuTab): void };

export function createTabMemory(storage: () => Storage): TabMemory {
  return {
    load() {
      try {
        return parseMenuTab(storage().getItem(KEY));
      } catch {
        return null;
      }
    },
    save(tab) {
      try {
        storage().setItem(KEY, tab);
      } catch {
        // The tab still works for this visit; it is just not remembered.
      }
    },
  };
}

export const menuTabMemory = createTabMemory(() => window.localStorage);
