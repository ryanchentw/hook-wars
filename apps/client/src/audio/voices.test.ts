import { describe, expect, it } from 'vitest';
import { admit, type ActiveVoice, type VoiceLimits } from './voices';

const LIMITS: VoiceLimits = { total: 3, perSound: 2, collapse: 0.03 };
const voice = (id: number, sound: string, startedAt: number, gain = 0.5, endsAt = 10): ActiveVoice => ({ id, sound, startedAt, endsAt, gain });
const ask = (sound: string, gain = 0.5) => ({ sound, gain });

describe('admit', () => {
  it('collapses one sound fired many times at once into its loudest', () => {
    const plan = admit([], [ask('bolt', 0.2), ask('bolt', 0.9), ask('bolt', 0.5)], 0, LIMITS);
    expect(plan.start).toEqual([ask('bolt', 0.9)]);
  });

  it('drops a sound that already started a moment ago', () => {
    expect(admit([voice(1, 'bolt', 1)], [ask('bolt')], 1.01, LIMITS).start).toEqual([]);
    expect(admit([voice(1, 'bolt', 1)], [ask('bolt')], 1.5, LIMITS).start).toEqual([ask('bolt')]);
  });

  it('holds each sound to its own cap', () => {
    const active = [voice(1, 'hit', 0), voice(2, 'hit', 0.5)];
    expect(admit(active, [ask('hit')], 1, LIMITS).start).toEqual([]);
  });

  it('forgets voices that have finished', () => {
    const active = [voice(1, 'hit', 0, 0.5, 0.4), voice(2, 'hit', 0.5, 0.5, 0.9)];
    expect(admit(active, [ask('hit')], 1, LIMITS).start).toEqual([ask('hit')]);
  });

  it('steals the quietest voice for a louder one when every voice is busy', () => {
    const active = [voice(1, 'a', 0, 0.6), voice(2, 'b', 0, 0.1), voice(3, 'c', 0, 0.4)];
    expect(admit(active, [ask('d', 0.5)], 1, LIMITS)).toEqual({ start: [ask('d', 0.5)], steal: [2] });
    expect(admit(active, [ask('d', 0.05)], 1, LIMITS)).toEqual({ start: [], steal: [] });
  });
});
