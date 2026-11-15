import type { GameEvent } from '@hookwars/sim';
import { describe, expect, it } from 'vitest';
import { BOT, fakePlayer, HUMAN } from '../../game/fakeSim';
import { FLOURISH } from '../theme';
import { flourishGlow, startsFlourish } from './flourish';

const bought: GameEvent = { kind: 'purchase', playerId: HUMAN, purchase: { kind: 'upgrade', id: 'size' }, cost: 200 };

describe('startsFlourish', () => {
  it('lights up a living buyer and nobody else', () => {
    expect(startsFlourish(fakePlayer({ id: HUMAN }), [bought])).toBe(true);
    expect(startsFlourish(fakePlayer({ id: BOT }), [bought])).toBe(false);
    expect(startsFlourish(fakePlayer({ id: HUMAN }), [{ kind: 'respawn', playerId: HUMAN }])).toBe(false);
  });

  it('leaves a dead buyer dark, since there is no body to light', () => {
    expect(startsFlourish(fakePlayer({ id: HUMAN, status: { kind: 'dead', respawnAt: 4 } }), [bought])).toBe(false);
  });
});

describe('flourishGlow', () => {
  it('flares up at once and is completely gone when its short life ends', () => {
    expect(flourishGlow(0)).toBeGreaterThan(0.5);
    expect(flourishGlow(FLOURISH.life * 0.5)).toBeGreaterThan(0);
    expect(flourishGlow(FLOURISH.life)).toBe(0);
    expect(flourishGlow(Number.POSITIVE_INFINITY)).toBe(0);
    expect(FLOURISH.life).toBeLessThanOrEqual(0.6);
  });
});
