import { describe, expect, it } from 'vitest';
import { fighterName } from './fighterName';

describe('fighterName', () => {
  it('is the name alone for a fighter a person drives', () => {
    expect(fighterName({ name: 'Ada', isBot: false })).toBe('Ada');
  });

  it('adds (bot) after the name of a fighter a computer drives', () => {
    expect(fighterName({ name: 'Ada', isBot: true })).toBe('Ada (bot)');
  });
});
