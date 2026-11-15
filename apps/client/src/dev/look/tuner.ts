import type { LookTap, Retunable } from '../../render/lookTap';
import type { SceneLook } from '../../render/scenes/types';
import type { Knob, KnobValue } from './knobs';
import { setOverride, withOverrides, type LookOverrides, type OverrideStore } from './overrides';

/** The overrides in force and the scene they are being tried on. */
export type Tuner = LookTap & {
  /** The scene on show, or null between scenes. */
  current(): Retunable | null;
  /** The look the scene on show is drawn with: its shipped look under the overrides. */
  tuned(): SceneLook | null;
  overrides(): LookOverrides;
  set(knob: Knob, value: KnobValue): void;
  /** Lays `scenes` over what is held, scene by scene: a pasted scene replaces that scene's overrides whole. */
  apply(scenes: LookOverrides): void;
  resetScene(): void;
  resetAll(): void;
  /** Told when the scene on show or any override changes. */
  subscribe(onChange: () => void): () => void;
};

export function createTuner(store: OverrideStore): Tuner {
  let overrides = store.load();
  let current: Retunable | null = null;
  const listeners = new Set<() => void>();
  const announce = (): void => listeners.forEach((listener) => listener());
  const replace = (next: LookOverrides): void => {
    overrides = next;
    store.save(overrides);
    current?.retune(withOverrides(current.shipped, overrides));
    announce();
  };

  return {
    adjust: (shipped) => withOverrides(shipped, overrides),
    shown(target) {
      current = target;
      announce();
    },
    gone(target) {
      if (current !== target) return;
      current = null;
      announce();
    },
    current: () => current,
    tuned: () => (current === null ? null : withOverrides(current.shipped, overrides)),
    overrides: () => overrides,
    set(knob, value) {
      if (current !== null) replace(setOverride(overrides, current.shipped, knob, value));
    },
    apply: (scenes) => replace({ ...overrides, ...scenes }),
    resetScene() {
      if (current === null) return;
      const { [current.id]: _dropped, ...rest } = overrides;
      replace(rest);
    },
    resetAll: () => replace({}),
    subscribe(onChange) {
      listeners.add(onChange);
      return () => void listeners.delete(onChange);
    },
  };
}
