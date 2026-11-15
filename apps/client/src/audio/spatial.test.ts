import { describe, expect, it } from 'vitest';
import { SPATIAL, spatialize } from './spatial';

const SCREEN = { width: 1000, height: 600 };
const CENTRE = { x: 500, y: 300 };

describe('spatialize', () => {
  it('plays news with no place at full gain, centred', () => {
    expect(spatialize({ at: null, listener: null, screenPos: null, screen: SCREEN })).toEqual({ gain: 1, pan: 0 });
  });

  it('is full and centred on top of the local fighter', () => {
    expect(spatialize({ at: { x: 0, y: 0 }, listener: { x: 0, y: 0 }, screenPos: CENTRE, screen: SCREEN })).toEqual({ gain: 1, pan: 0 });
  });

  it('gets quieter the further it is from the local fighter', () => {
    const at = (x: number) => spatialize({ at: { x, y: 0 }, listener: { x: 0, y: 0 }, screenPos: CENTRE, screen: SCREEN }).gain;
    expect(at(SPATIAL.near)).toBe(1);
    expect(at(800)).toBeLessThan(1);
    expect(at(1600)).toBeLessThan(at(800));
  });

  it('pans by where it is on screen', () => {
    const pan = (x: number) => spatialize({ at: { x: 0, y: 0 }, listener: { x: 0, y: 0 }, screenPos: { x, y: 300 }, screen: SCREEN }).pan;
    expect(pan(0)).toBeCloseTo(-SPATIAL.panWidth);
    expect(pan(1000)).toBeCloseTo(SPATIAL.panWidth);
    expect(pan(750)).toBeGreaterThan(0);
  });

  it('is never loud off screen, and fades out further past the edge', () => {
    const off = (x: number) => spatialize({ at: { x: 0, y: 0 }, listener: { x: 0, y: 0 }, screenPos: { x, y: 300 }, screen: SCREEN }).gain;
    expect(off(1001)).toBeLessThanOrEqual(SPATIAL.offscreen);
    expect(off(1000 + SPATIAL.offscreenFade / 2)).toBeLessThan(off(1001));
    expect(off(1000 + SPATIAL.offscreenFade)).toBe(0);
  });
});
