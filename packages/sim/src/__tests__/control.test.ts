import { describe, expect, it } from 'vitest';
import { viewFor, withBotControl } from '../index';
import { match, pid, player } from './helpers';

describe('withBotControl', () => {
  it('marks exactly the fighters a computer drives, and every team sees it', () => {
    const state = withBotControl(match([['a', 'west'], ['b', 'east']]), new Set([pid('b')]));
    expect([player(state, 'a').isBot, player(state, 'b').isBot]).toEqual([false, true]);
    expect(viewFor(state, 'west').roster.map((p) => p.isBot)).toEqual([false, true]);
    expect(viewFor(state, 'east').players.map((p) => p.isBot)).toEqual([false, true]);
  });

  it('hands the fighter back when the computer lets go', () => {
    const driven = withBotControl(match([['a', 'west'], ['b', 'east']]), new Set([pid('a')]));
    expect(player(withBotControl(driven, new Set()), 'a').isBot).toBe(false);
  });

  it('returns the same state when nothing changed hands', () => {
    const state = withBotControl(match([['a', 'west'], ['b', 'east']]), new Set([pid('b')]));
    expect(withBotControl(state, new Set([pid('b')]))).toBe(state);
  });
});
