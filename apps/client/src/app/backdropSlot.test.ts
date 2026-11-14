import { describe, expect, it } from 'vitest';
import type { Backdrop } from '../render/backdrop';
import type { SceneId } from '../render/scenes/types';
import { createBackdropSlot } from './backdropSlot';

function harness(fail: ReadonlySet<SceneId> = new Set()) {
  const live = new Set<SceneId>();
  const built: SceneId[] = [];
  const errors: unknown[] = [];
  const make = async (scene: SceneId): Promise<Backdrop> => {
    await Promise.resolve();
    if (fail.has(scene)) throw new Error(`no ${scene}`);
    built.push(scene);
    live.add(scene);
    return { sceneId: scene, dispose: () => live.delete(scene) };
  };
  return { live, built, errors, slot: createBackdropSlot(make, (e) => errors.push(e)) };
}

describe('backdrop slot', () => {
  it('keeps one scene alive and skips requests overtaken before they were built', async () => {
    const { live, built, slot } = harness();
    void slot.show('daan');
    void slot.show('harbour');
    await slot.show('victoria');
    expect([...live]).toEqual(['victoria']);
    expect(built).not.toContain('harbour');
  });

  it('builds nothing for the scene already up, and clears on null', async () => {
    const { live, built, slot } = harness();
    await slot.show('daan');
    await slot.show('daan');
    expect(built).toEqual(['daan']);
    await slot.show(null);
    expect(live.size).toBe(0);
  });

  it('reports a scene that fails to build and recovers on the next request', async () => {
    const { live, errors, slot } = harness(new Set<SceneId>(['daan']));
    await slot.show('daan');
    expect(errors).toHaveLength(1);
    await slot.show('harbour');
    expect([...live]).toEqual(['harbour']);
  });
});
