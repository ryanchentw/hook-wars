/** A value React reads with `useSyncExternalStore`: a new object on every change, the same one otherwise. */
export type Store<T> = {
  subscribe(onChange: () => void): () => void;
  getSnapshot(): T;
  update(change: (current: T) => T): void;
};

export function createStore<T>(initial: T): Store<T> {
  const listeners = new Set<() => void>();
  let value = initial;
  return {
    subscribe(onChange) {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    getSnapshot: () => value,
    update(change) {
      const next = change(value);
      if (next === value) return;
      value = next;
      listeners.forEach((l) => l());
    },
  };
}
