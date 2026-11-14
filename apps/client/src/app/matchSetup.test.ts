import { toMatchConfig } from '@hookbrawl/room';
import type { MatchPlan, MemberId, RoomState } from '@hookbrawl/room';
import { describe, expect, it } from 'vitest';
import { directRoom, matchSeed, MAX_STARTING_GOLD, pageOptionsFromQuery, sessionSetupFor } from './matchSetup';

const ME = 'me' as MemberId;
const NO_OVERRIDES = { idleOpponent: false, startingGold: null };

function planOf(room: RoomState, seed = 1): MatchPlan {
  const plan = toMatchConfig(room, seed);
  if (plan === null) throw new Error('expected a plan');
  return plan;
}

describe('pageOptionsFromQuery', () => {
  it('reads the seed and falls back to the clock when it is missing or malformed', () => {
    expect(pageOptionsFromQuery('?seed=42', 1000).seed).toBe(42);
    expect(pageOptionsFromQuery('', 1000).seed).toBe(1000);
    expect(pageOptionsFromQuery('?seed=abc', 1000).seed).toBe(1000);
  });

  it('shows the menu for a plain address and goes straight to a match for any test switch', () => {
    expect(pageOptionsFromQuery('', 0).direct).toBeNull();
    expect(pageOptionsFromQuery('?utm=x', 0).direct).toBeNull();
    for (const query of ['?seed=1', '?opponent=idle', '?gold=5', '?scene=daan', '?intro=off', '?roster=3v3', '?fog=on']) {
      expect(pageOptionsFromQuery(query, 0).direct).not.toBeNull();
    }
  });

  it('takes a roster of one to three a side, a 1v1 otherwise', () => {
    expect(pageOptionsFromQuery('?roster=3v3', 0).direct?.roster).toEqual({ west: 3, east: 3 });
    expect(pageOptionsFromQuery('?roster=2v1', 0).direct?.roster).toEqual({ west: 2, east: 1 });
    for (const bad of ['?roster=4v4', '?roster=0v1', '?roster=3', '?seed=1']) {
      expect(pageOptionsFromQuery(bad, 0).direct?.roster).toEqual({ west: 1, east: 1 });
    }
  });

  it('takes a known scene, rotates otherwise, and plays the intro unless told not to', () => {
    expect(pageOptionsFromQuery('?scene=daan', 0).direct?.scene).toBe('daan');
    expect(pageOptionsFromQuery('?scene=atlantis', 0).direct?.scene).toBe('rotate');
    expect(pageOptionsFromQuery('', 0).intro).toBe(true);
    expect(pageOptionsFromQuery('?intro=off', 0).intro).toBe(false);
  });

  it('only idles the opponent when asked to', () => {
    expect(pageOptionsFromQuery('?opponent=idle', 0).overrides.idleOpponent).toBe(true);
    expect(pageOptionsFromQuery('?opponent=anything', 0).overrides.idleOpponent).toBe(false);
  });

  it('takes starting gold as a capped non-negative whole number and ignores anything else', () => {
    expect(pageOptionsFromQuery('?gold=2000', 0).overrides.startingGold).toBe(2000);
    expect(pageOptionsFromQuery('?gold=0', 0).overrides.startingGold).toBe(0);
    for (const bad of ['', '?gold=', '?gold=-5', '?gold=1.5', '?gold=1e3', '?gold=abc', '?gold= 7']) {
      expect(pageOptionsFromQuery(bad, 0).overrides.startingGold).toBeNull();
    }
    expect(pageOptionsFromQuery(`?gold=${MAX_STARTING_GOLD * 10}`, 0).overrides.startingGold).toBe(MAX_STARTING_GOLD);
  });
});

describe('directRoom', () => {
  it('puts the local player first on the west against one bot, first to ten, already in play', () => {
    const room = directRoom({ roster: { west: 1, east: 1 }, scene: 'rotate', fog: false }, ME);
    expect(room.phase.kind).toBe('in-match');
    const { config, scene } = planOf(room);
    expect(config.killTarget).toBe(10);
    expect(scene).toBe('victoria');
    expect(config.players.map((p) => [p.team, p.isBot])).toEqual([
      ['west', false],
      ['east', true],
    ]);
  });

  it('turns fog of war on only for ?fog=on, and carries it into the match', () => {
    expect(pageOptionsFromQuery('?fog=on', 0).direct?.fog).toBe(true);
    expect(pageOptionsFromQuery('?fog=yes', 0).direct?.fog).toBe(false);
    expect(pageOptionsFromQuery('?seed=1', 0).direct?.fog).toBe(false);
    expect(planOf(directRoom({ roster: { west: 1, east: 1 }, scene: 'rotate', fog: true }, ME)).config.fog).toBe(true);
  });

  it('fills a 3v3 and keeps a chosen scene', () => {
    const plan = planOf(directRoom({ roster: { west: 3, east: 3 }, scene: 'daan', fog: false }, ME));
    expect(plan.config.players.filter((p) => p.isBot)).toHaveLength(5);
    expect(plan.scene).toBe('daan');
  });
});

describe('sessionSetupFor', () => {
  const duel = planOf(directRoom({ roster: { west: 2, east: 2 }, scene: 'rotate', fog: false }, ME), 9);

  it('drives every bot with its own seed and finds the local fighter', () => {
    const setup = sessionSetupFor(duel, ME, NO_OVERRIDES);
    expect(setup.localPlayerId).toBe('west-0');
    expect(setup.bots).toEqual([
      { id: 'west-1', seed: 9 },
      { id: 'east-0', seed: 10 },
      { id: 'east-1', seed: 11 },
    ]);
    expect(setup.config.startingGold).toBeUndefined();
  });

  it('turns the east bots into dummies that nothing drives, and sets starting gold', () => {
    const setup = sessionSetupFor(duel, ME, { idleOpponent: true, startingGold: 0 });
    expect(setup.bots.map((b) => b.id)).toEqual(['west-1']);
    expect(setup.config.players.filter((p) => p.team === 'east').map((p) => [p.name, p.isBot])).toEqual([
      ['Dummy', false],
      ['Dummy', false],
    ]);
    expect(setup.config.startingGold).toBe(0);
  });

  it('refuses a member without a seat', () => {
    expect(() => sessionSetupFor(duel, 'someone' as MemberId, NO_OVERRIDES)).toThrow('no longer have a seat');
  });
});

describe('matchSeed', () => {
  it('uses the seed for the first match and moves on for each rematch', () => {
    expect(matchSeed(5, 1)).toBe(5);
    expect(matchSeed(5, 2)).not.toBe(5);
    expect(matchSeed(5, 3)).not.toBe(matchSeed(5, 2));
  });
});
