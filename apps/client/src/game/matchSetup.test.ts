import { describe, expect, it } from 'vitest';
import { createMatchSetup, MAX_STARTING_GOLD, optionsFromQuery } from './matchSetup';

const defaults = { botSeed: 1, idleOpponent: false, startingGold: null };

describe('optionsFromQuery', () => {
  it('reads the seed and falls back to the clock when it is missing or malformed', () => {
    expect(optionsFromQuery('?seed=42', 1000).botSeed).toBe(42);
    expect(optionsFromQuery('', 1000).botSeed).toBe(1000);
    expect(optionsFromQuery('?seed=abc', 1000).botSeed).toBe(1000);
  });

  it('only idles the opponent when asked to', () => {
    expect(optionsFromQuery('?opponent=idle', 0).idleOpponent).toBe(true);
    expect(optionsFromQuery('?opponent=anything', 0).idleOpponent).toBe(false);
    expect(optionsFromQuery('', 0).idleOpponent).toBe(false);
  });

  it('takes starting gold as a non-negative whole number and ignores anything else', () => {
    expect(optionsFromQuery('?gold=2000', 0).startingGold).toBe(2000);
    expect(optionsFromQuery('?gold=0', 0).startingGold).toBe(0);
    for (const bad of ['', '?gold=', '?gold=-5', '?gold=1.5', '?gold=1e3', '?gold=abc', '?gold= 7']) {
      expect(optionsFromQuery(bad, 0).startingGold).toBeNull();
    }
  });

  it('caps starting gold', () => {
    expect(optionsFromQuery(`?gold=${MAX_STARTING_GOLD * 10}`, 0).startingGold).toBe(MAX_STARTING_GOLD);
    expect(optionsFromQuery('?gold=99999999999999999999999', 0).startingGold).toBe(MAX_STARTING_GOLD);
  });
});

describe('createMatchSetup', () => {
  it('pits the local player against a bot by default, first to ten', () => {
    const { config } = createMatchSetup(defaults);
    expect(config.killTarget).toBe(10);
    expect(config.players.map((p) => [p.team, p.isBot])).toEqual([
      ['west', false],
      ['east', true],
    ]);
  });

  it('swaps the bot for a practice dummy that nothing drives', () => {
    const { config } = createMatchSetup({ ...defaults, idleOpponent: true });
    expect(config.players.map((p) => p.isBot)).toEqual([false, false]);
  });

  it('leaves starting gold to the sim unless one was asked for', () => {
    expect(createMatchSetup(defaults).config.startingGold).toBeUndefined();
    expect(createMatchSetup({ ...defaults, startingGold: 0 }).config.startingGold).toBe(0);
  });
});
