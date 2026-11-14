import { describe, expect, it } from 'vitest';
import { createM1Setup, optionsFromQuery } from './matchSetup';

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
});

describe('createM1Setup', () => {
  it('pits the local player against a bot by default', () => {
    const { config } = createM1Setup({ botSeed: 1, idleOpponent: false });
    expect(config.players.map((p) => [p.team, p.isBot])).toEqual([
      ['west', false],
      ['east', true],
    ]);
  });

  it('swaps the bot for a practice dummy that nothing drives', () => {
    const { config } = createM1Setup({ botSeed: 1, idleOpponent: true });
    expect(config.players.map((p) => p.isBot)).toEqual([false, false]);
  });
});
