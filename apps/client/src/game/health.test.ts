import { describe, expect, it } from 'vitest';
import { hpLevel } from './health';

describe('hpLevel', () => {
  it('turns low at half health and critical at a quarter', () => {
    expect(hpLevel(1)).toBe('ok');
    expect(hpLevel(0.51)).toBe('ok');
    expect(hpLevel(0.5)).toBe('low');
    expect(hpLevel(0.26)).toBe('low');
    expect(hpLevel(0.25)).toBe('critical');
    expect(hpLevel(0)).toBe('critical');
  });
});
