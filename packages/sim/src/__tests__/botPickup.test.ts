import { describe, expect, it } from 'vitest';
import { botThink, createBotBrain, createMatch, TUNING } from '../index';
import type { GameState, PlayerInput, Vec2 } from '../index';
import { at, pid, withPickup, withPlayer } from './helpers';

const BOT = at(420, 335);
const PICKUP = at(1100, 900);
const ENEMY = at(1600, 335);

function duel(withEnemyInReach: boolean): GameState {
  const s = createMatch({
    killTarget: 5,
    players: [
      { id: pid('b'), name: 'b', team: 'west', isBot: true },
      { id: pid('e'), name: 'e', team: 'east', isBot: false },
    ],
  });
  const placed = withPlayer(withPlayer(s, 'b', { pos: BOT }), 'e', { pos: withEnemyInReach ? ENEMY : at(2300, 1300) });
  return withPickup(placed, 'gold', PICKUP);
}

/** Where each of many differently seeded bots throws on its first think, by which mark the aim is nearer. */
function marks(s: GameState): { readonly pickup: number; readonly fighter: number } {
  const throws = Array.from({ length: 400 }, (_, seed) => botThink(s, pid('b'), createBotBrain(seed)).inputs)
    .flatMap((inputs) => inputs.filter((i): i is Extract<PlayerInput, { kind: 'hook' }> => i.kind === 'hook'));
  const angle = (p: Vec2) => Math.atan2(p.y - BOT.y, p.x - BOT.x);
  const nearer = (t: Vec2) => Math.abs(angle(t) - angle(PICKUP)) < Math.abs(angle(t) - angle(ENEMY));
  const pickup = throws.filter((t) => nearer(t.target)).length;
  return { pickup, fighter: throws.length - pickup };
}

describe('bots and pickups', () => {
  it('throw at a pickup in reach about the configured share of the time, and at the fighter otherwise', () => {
    const { pickup, fighter } = marks(duel(true));
    const share = pickup / (pickup + fighter);
    expect(fighter).toBeGreaterThan(0);
    expect(share).toBeGreaterThan(TUNING.botPickupChance - 0.1);
    expect(share).toBeLessThan(TUNING.botPickupChance + 0.1);
  });

  it('throw at a pickup in reach when no fighter is', () => {
    const { pickup, fighter } = marks(duel(false));
    expect(pickup).toBeGreaterThan(0);
    expect(fighter).toBe(0);
  });
});
