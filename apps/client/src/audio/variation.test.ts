import { describe, expect, it } from 'vitest';
import { pickVariant, vary } from './variation';

describe('pickVariant', () => {
  it('never repeats the last variant when there is another', () => {
    for (const r of [0, 0.3, 0.6, 0.99]) expect(pickVariant(3, 1, () => r)).not.toBe(1);
  });

  it('plays the only variant there is', () => {
    expect(pickVariant(1, 0, () => 0.7)).toBe(0);
  });
});

describe('vary', () => {
  it('leaves a sound with no spread as it is', () => {
    expect(vary({ pitch: 0, jitterDb: 0 }, () => 0.9)).toEqual({ rate: 1, gain: 1 });
  });

  it('stays within the spread it is given', () => {
    const low = vary({ pitch: 2, jitterDb: 6 }, () => 0);
    const high = vary({ pitch: 2, jitterDb: 6 }, () => 1);
    expect(low.rate).toBeCloseTo(2 ** (-2 / 12));
    expect(high.rate).toBeCloseTo(2 ** (2 / 12));
    expect(low.gain).toBeCloseTo(10 ** (-6 / 20));
    expect(high.gain).toBeCloseTo(10 ** (6 / 20));
  });
});
