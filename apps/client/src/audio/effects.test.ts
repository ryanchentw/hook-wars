import { describe, expect, it } from 'vitest';
import { createEffects } from './effects';
import { createFakeOutput } from './fakeOutput';
import { createMusic } from './music';

const BASE = '/';

async function loadedEffects() {
  const output = createFakeOutput();
  const effects = createEffects(output, BASE, () => 0.5);
  await effects.load();
  return { output, effects };
}

describe('effects', () => {
  it('plays nothing until a gesture has let audio start', async () => {
    const { output, effects } = await loadedEffects();
    effects.play([{ sound: 'melee', gain: 1, pan: 0 }]);
    expect(output.played()).toEqual([]);
    output.unlock();
    effects.play([{ sound: 'melee', gain: 1, pan: 0 }]);
    expect(output.played().map((p) => p.label)).toEqual(['melee']);
  });

  it('plays one bolt for a storm that strikes six fighters at once', async () => {
    const { output, effects } = await loadedEffects();
    output.unlock();
    effects.play(Array.from({ length: 6 }, (_, i) => ({ sound: 'stormBolt' as const, gain: 0.1 * (i + 1), pan: 0 })));
    expect(output.played()).toHaveLength(1);
  });

  it('drops a sound placed too far away to hear', async () => {
    const { output, effects } = await loadedEffects();
    output.unlock();
    effects.play([{ sound: 'hookThrow', gain: 0, pan: 0 }]);
    expect(output.played()).toEqual([]);
  });

  it('fetches every effect file once', async () => {
    const { output } = await loadedEffects();
    expect(new Set(output.loaded()).size).toBe(output.loaded().length);
    expect(output.loaded()).toContain('/audio/melee-1.mp3');
  });
});

describe('music', () => {
  it('fades the menu track out under the match track, and loops the match before its end', async () => {
    const output = createFakeOutput();
    const music = createMusic(output, BASE);
    await music.load();
    output.unlock();
    music.want('menu');
    music.want('match');
    const firstPasses = output.played().map((p) => p.label);
    expect(firstPasses).toEqual(['music:menu', 'music:match']);
    music.tick();
    const [, first, next] = output.played();
    expect(next?.label).toBe('music:match');
    expect(next?.when).toBeGreaterThan(first?.when ?? 0);
    expect(next?.when).toBeLessThan((first?.when ?? 0) + (first?.length ?? 0));
  });
});
