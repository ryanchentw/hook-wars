import { describe, expect, it } from 'vitest';
import { CREDITS_HASH, parseRoute } from './route';

describe('parseRoute', () => {
  it('opens credits for the credits hash', () => {
    expect(parseRoute('#/credits')).toBe('credits');
    expect(parseRoute(CREDITS_HASH)).toBe('credits');
  });

  it('tolerates a trailing slash and letter case', () => {
    expect(parseRoute('#/credits/')).toBe('credits');
    expect(parseRoute('#/Credits')).toBe('credits');
  });

  it('shows the game for an empty or unknown hash', () => {
    expect(parseRoute('')).toBe('game');
    expect(parseRoute('#')).toBe('game');
    expect(parseRoute('#/')).toBe('game');
    expect(parseRoute('#credits-and-more')).toBe('game');
    expect(parseRoute('#/creditsx')).toBe('game');
  });
});
