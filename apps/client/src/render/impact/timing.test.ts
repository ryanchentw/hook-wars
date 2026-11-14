import { describe, expect, it } from 'vitest';
import { IMPACTS } from './impacts';
import { envelope, flashAmount, hitStopped, lungeAmount, popScale, recoilAmount, type Envelope } from './timing';

const AGES = Array.from({ length: 200 }, (_, i) => i * 0.005);

describe('envelope', () => {
  const shape: Envelope = { attack: 0.04, hold: 0.02, release: 0.2 };

  it('is nothing before it starts and nothing once it has run its course', () => {
    expect(envelope(-0.01, shape)).toBe(0);
    expect(envelope(Number.NaN, shape)).toBe(0);
    expect(envelope(Number.POSITIVE_INFINITY, shape)).toBe(0);
    expect(envelope(shape.attack + shape.hold + shape.release, shape)).toBe(0);
  });

  it('rises to full, holds, then only ever falls', () => {
    expect(envelope(0, shape)).toBe(0);
    expect(envelope(shape.attack / 2, shape)).toBeCloseTo(0.5);
    expect(envelope(shape.attack + shape.hold / 2, shape)).toBe(1);
    const falling = AGES.filter((age) => age >= shape.attack + shape.hold).map((age) => envelope(age, shape));
    falling.slice(1).forEach((value, i) => expect(value).toBeLessThanOrEqual(falling[i]!));
  });

  it('starts at full when it has no attack', () => {
    expect(envelope(0, { attack: 0, hold: 0, release: 0.1 })).toBe(1);
  });

  it('never leaves the range nought to one', () => {
    AGES.forEach((age) => {
      expect(envelope(age, shape)).toBeGreaterThanOrEqual(0);
      expect(envelope(age, shape)).toBeLessThanOrEqual(1);
    });
  });
});

describe.each(Object.entries(IMPACTS))('%s impact timing', (_kind, spec) => {
  it('freezes the fighters for well under a tenth of a second', () => {
    expect(spec.hitStop).toBeGreaterThanOrEqual(0.06);
    expect(spec.hitStop).toBeLessThanOrEqual(0.09);
    expect(hitStopped(0, spec)).toBe(true);
    expect(hitStopped(spec.hitStop - 0.001, spec)).toBe(true);
    expect(hitStopped(spec.hitStop, spec)).toBe(false);
    expect(hitStopped(-0.01, spec)).toBe(false);
    expect(hitStopped(Number.POSITIVE_INFINITY, spec)).toBe(false);
  });

  it('holds the attacker at full reach through the freeze, then lets them back', () => {
    expect(lungeAmount(-0.01, spec)).toBe(0);
    expect(lungeAmount(0, spec)).toBe(1);
    expect(lungeAmount(spec.hitStop, spec)).toBe(1);
    expect(lungeAmount(spec.hitStop + spec.lunge.envelope.release / 2, spec)).toBeLessThan(1);
  });

  it('keeps the victim planted through the freeze, then knocks them back', () => {
    expect(recoilAmount(0, spec)).toBe(0);
    expect(recoilAmount(spec.hitStop - 0.001, spec)).toBe(0);
    const peak = spec.hitStop + spec.recoil.envelope.attack;
    expect(recoilAmount(peak, spec)).toBeCloseTo(1);
  });

  it('returns both bodies to exactly where the sim has them, well inside one melee interval', () => {
    const settled = AGES.filter((age) => age >= 0.45);
    settled.forEach((age) => {
      expect(lungeAmount(age, spec)).toBe(0);
      expect(recoilAmount(age, spec)).toBe(0);
      expect(flashAmount(age, spec)).toBe(0);
    });
  });

  it('lights the victim at once and for only a few frames', () => {
    expect(flashAmount(0, spec)).toBe(1);
    expect(flashAmount(0.2, spec)).toBe(0);
    expect(flashAmount(-0.01, spec)).toBe(0);
  });

  it('pops the number past its size and settles it at exactly that size', () => {
    const scales = AGES.map((age) => popScale(age, spec.pop));
    expect(scales[0]).toBeLessThan(1);
    expect(Math.max(...scales)).toBeCloseTo(spec.pop.peak, 1);
    expect(spec.pop.peak).toBeGreaterThan(1.2);
    AGES.filter((age) => age >= spec.pop.rise + spec.pop.settle).forEach((age) => expect(popScale(age, spec.pop)).toBe(1));
    expect(popScale(10, spec.pop)).toBe(1);
  });
});
