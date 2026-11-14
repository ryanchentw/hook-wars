import { describe, expect, it } from 'vitest';
import { SHAKE } from '../theme';
import { shakeOffset } from './shake';

describe('shakeOffset', () => {
  it('stays small and short', () => {
    expect(SHAKE.duration).toBeLessThanOrEqual(0.4);
    for (let age = 0; age < SHAKE.duration; age += 0.005) {
      const { right, up } = shakeOffset(age);
      expect(Math.abs(right)).toBeLessThanOrEqual(SHAKE.amplitude);
      expect(Math.abs(up)).toBeLessThanOrEqual(SHAKE.amplitude);
    }
  });

  it('moves the camera right after a hit and is still again once it has run its course', () => {
    const early = shakeOffset(0.01);
    expect(Math.hypot(early.right, early.up)).toBeGreaterThan(0.05);
    expect(shakeOffset(SHAKE.duration)).toEqual({ right: 0, up: 0 });
    expect(shakeOffset(10)).toEqual({ right: 0, up: 0 });
  });

  it('is still when there has been no hit', () => {
    expect(shakeOffset(Number.POSITIVE_INFINITY)).toEqual({ right: 0, up: 0 });
    expect(shakeOffset(Number.NaN)).toEqual({ right: 0, up: 0 });
  });
});
