import { describe, expect, it } from 'vitest';
import type { Retunable } from '../../render/lookTap';
import { SCENES } from '../../render/scenes/registry';
import type { SceneId, SceneLook } from '../../render/scenes/types';
import { KNOB_BY_ID } from './knobs';
import type { LookOverrides, OverrideStore } from './overrides';
import { createTuner } from './tuner';

const exposure = KNOB_BY_ID.get('atmosphere.exposure')!;

function memoryStore(initial: LookOverrides = {}): OverrideStore & { saved: LookOverrides } {
  const store = {
    saved: initial,
    load: () => store.saved,
    save: (all: LookOverrides) => void (store.saved = all),
  };
  return store;
}

function show(id: SceneId): Retunable & { looks: SceneLook[] } {
  const looks: SceneLook[] = [];
  return { id, shipped: SCENES[id], looks, retune: (look) => void looks.push(look) };
}

describe('createTuner', () => {
  it('builds a scene with the overrides remembered for it', () => {
    const tuner = createTuner(memoryStore({ daan: { 'atmosphere.exposure': 2 } }));
    expect(tuner.adjust(SCENES.daan).atmosphere.exposure).toBe(2);
    expect(tuner.adjust(SCENES.victoria)).toBe(SCENES.victoria);
  });

  it('retunes the scene on show at once, saves, and tells whoever is listening', () => {
    const store = memoryStore();
    const tuner = createTuner(store);
    const scene = show('victoria');
    let told = 0;
    tuner.subscribe(() => (told += 1));
    tuner.shown(scene);
    tuner.set(exposure, 2);
    expect(scene.looks.at(-1)?.atmosphere.exposure).toBe(2);
    expect(store.saved).toEqual({ victoria: { 'atmosphere.exposure': 2 } });
    expect(tuner.tuned()?.atmosphere.exposure).toBe(2);
    expect(told).toBe(2);
  });

  it('follows the scene on show: a change lands on the new scene and leaves the old one\'s overrides be', () => {
    const tuner = createTuner(memoryStore());
    const first = show('victoria');
    tuner.shown(first);
    tuner.set(exposure, 2);
    tuner.gone(first);
    expect(tuner.current()).toBeNull();
    tuner.shown(show('daan'));
    tuner.set(exposure, 0.5);
    expect(tuner.overrides()).toEqual({ victoria: { 'atmosphere.exposure': 2 }, daan: { 'atmosphere.exposure': 0.5 } });
  });

  it('ignores a scene going that is no longer the one on show', () => {
    const tuner = createTuner(memoryStore());
    const old = show('victoria');
    const next = show('daan');
    tuner.shown(old);
    tuner.shown(next);
    tuner.gone(old);
    expect(tuner.current()).toBe(next);
  });

  it('resets one scene or all of them to what ships', () => {
    const store = memoryStore({ victoria: { 'atmosphere.exposure': 2 }, daan: { 'atmosphere.exposure': 0.5 } });
    const tuner = createTuner(store);
    const scene = show('victoria');
    tuner.shown(scene);
    tuner.resetScene();
    expect(scene.looks.at(-1)).toBe(SCENES.victoria);
    expect(store.saved).toEqual({ daan: { 'atmosphere.exposure': 0.5 } });
    tuner.resetAll();
    expect(store.saved).toEqual({});
  });

  it('applies pasted overrides scene by scene', () => {
    const tuner = createTuner(memoryStore({ victoria: { 'atmosphere.exposure': 2, 'bloom.on': false }, daan: { 'atmosphere.exposure': 0.5 } }));
    const scene = show('victoria');
    tuner.shown(scene);
    tuner.apply({ victoria: { 'bloom.strength': 1 } });
    expect(tuner.overrides()).toEqual({ victoria: { 'bloom.strength': 1 }, daan: { 'atmosphere.exposure': 0.5 } });
    expect(scene.looks.at(-1)?.atmosphere.exposure).toBe(SCENES.victoria.atmosphere.exposure);
  });
});
