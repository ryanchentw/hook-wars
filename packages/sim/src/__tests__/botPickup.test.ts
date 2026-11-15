import { describe, expect, it } from 'vitest';
import { botThink, createBotBrain, createMatch, step, TICK_DT, TUNING } from '../index';
import type { BotBrain, GameState, PlayerId, PlayerInput, Vec2 } from '../index';
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

/** A 3v3 of bots to five kills with pickups on: how it ended and how many pickups reached a hand. */
function botMatch(seed: number): { readonly state: GameState; readonly collected: number } {
  const players = (['west', 'east'] as const).flatMap((team) => [0, 1, 2].map((i) => ({ id: pid(`${team}${i}`), name: `${team}${i}`, team, isBot: true })));
  let state = createMatch({ killTarget: 5, fog: true, pickups: true, seed, players });
  let brains = new Map<PlayerId, BotBrain>(state.players.map((p, i) => [p.id, createBotBrain(seed * 31 + i)]));
  let collected = 0;
  for (let i = 0; i < 600 / TICK_DT && state.phase.kind === 'playing'; i++) {
    const thoughts = state.players.map((p) => ({ id: p.id, ...botThink(state, p.id, brains.get(p.id)!) }));
    brains = new Map(thoughts.map((x) => [x.id, x.brain]));
    state = step(state, thoughts.flatMap((x) => x.inputs), TICK_DT);
    collected += state.events.filter((e) => e.kind === 'pickupCollected').length;
  }
  return { state, collected };
}

describe('bots and pickups', () => {
  it('still fight a 3v3 to the end with pickups on, and bring some home', () => {
    const runs = [1, 2, 3].map(botMatch);
    runs.forEach(({ state }) => expect(state.phase.kind).toBe('ended'));
    expect(runs.reduce((n, r) => n + r.collected, 0)).toBeGreaterThan(0);
  });

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
