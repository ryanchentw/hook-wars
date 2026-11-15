import { describe, expect, it } from 'vitest';
import { createMatch, step, TICK_DT, viewFor } from '@hookwars/sim';
import type { GameState, MatchConfig, PlayerId, TeamView } from '@hookwars/sim';
import { cuesFor } from './cues';
import { countdownTicks, cueContext, purchaseSounds, respawnLeft } from './matchCues';

const WEST = 'w' as PlayerId;
const EAST = 'e' as PlayerId;
const config = (fog: boolean): MatchConfig => ({
  players: [
    { id: WEST, name: 'West', team: 'west', isBot: false },
    { id: EAST, name: 'East', team: 'east', isBot: false },
  ],
  killTarget: 5,
  fog,
});

/** The east fighter throws a hook away from everyone; the west team listens. */
function eastCastsAway(fog: boolean): TeamView {
  const start = createMatch(config(fog));
  const east = start.players.find((p) => p.id === EAST);
  const away = { x: start.arena.width, y: east?.pos.y ?? 0 };
  const next: GameState = step(start, [{ kind: 'hook', playerId: EAST, target: away }], TICK_DT);
  return viewFor(next, 'west');
}

const heard = (view: TeamView) => cuesFor(view.events, cueContext(view, WEST, 'west')).map((c) => c.sound);

describe('what the west team hears of an east hook', () => {
  it('hears the throw when nothing is hidden', () => {
    expect(heard(eastCastsAway(false))).toContain('hookThrow');
  });

  it('hears nothing of a throw made out of its sight under fog', () => {
    const view = eastCastsAway(true);
    expect(view.players.map((p) => p.id)).not.toContain(EAST);
    expect(heard(view)).toEqual([]);
  });
});

describe('respawn countdown', () => {
  it('ticks each whole second the local fighter waits, not when they fall', () => {
    expect(countdownTicks(null, 5)).toBe(false);
    expect(countdownTicks(5, 4)).toBe(true);
    expect(countdownTicks(4, 4)).toBe(false);
    expect(countdownTicks(1, null)).toBe(false);
  });

  it('reads the seconds left from the local fighter only', () => {
    const view = viewFor(createMatch(config(false)), 'west');
    const dead: TeamView = { ...view, time: 2.2, players: view.players.map((p) => (p.id === WEST ? { ...p, status: { kind: 'dead', respawnAt: 5 } } : p)) };
    expect(respawnLeft(dead, WEST)).toBe(3);
    expect(respawnLeft(dead, EAST)).toBe(null);
  });
});

describe('purchaseSounds', () => {
  it('sounds each newly answered buy once, coins for a purchase and a buzz for a refusal', () => {
    const slots = { hook: { outcome: 'bought' as const, seq: 3 }, grapple: { outcome: 'poor' as const, seq: 4 } };
    expect(purchaseSounds(2, slots)).toEqual({ seq: 4, sounds: ['purchase', 'refused'] });
    expect(purchaseSounds(4, slots)).toEqual({ seq: 4, sounds: [] });
  });
});
