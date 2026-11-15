import { describe, expect, it } from 'vitest';
import { contentBounds, loopPass } from './loop';

describe('contentBounds', () => {
  it('skips the near-silence a codec pads either end with', () => {
    const samples = new Float32Array([0, 0.00001, 0, 0.3, -0.5, 0.2, 0, 0]);
    expect(contentBounds([samples], 4, 0.001)).toEqual({ start: 0.75, end: 1.5 });
  });

  it('reads every channel', () => {
    const left = new Float32Array([0, 0, 0.5, 0]);
    const right = new Float32Array([0.5, 0, 0, 0]);
    expect(contentBounds([left, right], 4, 0.001)).toEqual({ start: 0, end: 0.75 });
  });

  it('treats an all-silent clip as empty at its start', () => {
    expect(contentBounds([new Float32Array(4)], 4, 0.001)).toEqual({ start: 0, end: 0 });
  });
});

describe('loopPass', () => {
  it('starts the next pass an overlap before the content ends, and fades the old one out across it', () => {
    expect(loopPass({ start: 0.05, end: 100.05 }, { overlap: 2, fadeIn: 0 })).toEqual({ offset: 0.05, length: 100, period: 98, fadeIn: 0, fadeOut: 2 });
  });

  it('never lets the overlap swallow a short clip', () => {
    expect(loopPass({ start: 0, end: 1 }, { overlap: 3, fadeIn: 0 }).period).toBeGreaterThan(0);
  });
});
