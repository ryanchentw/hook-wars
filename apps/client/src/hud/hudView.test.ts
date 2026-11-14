import { describe, expect, it } from 'vitest';
import { TUNING } from '@hookbrawl/sim';
import type { HookId } from '@hookbrawl/sim';
import { BOT, fakePlayer, fakeState, HUMAN } from '../game/fakeSim';
import { appendKills, deriveHud, KILL_FEED_SIZE } from './hudView';

const players = [
  fakePlayer({ id: HUMAN, name: 'You', hookReadyAt: 10.6 }),
  fakePlayer({ id: BOT, name: 'Bot', team: 'east', isBot: true }),
];

describe('deriveHud', () => {
  it('reports cooldown remaining as seconds and a fraction of the full cooldown', () => {
    const view = deriveHud(fakeState({ time: 10, players }), HUMAN, []);
    expect(view.local?.cooldownSeconds).toBeCloseTo(0.6);
    expect(view.local?.cooldownFraction).toBeCloseTo(0.6 / TUNING.hookCooldown);
    expect(view.local?.hookInFlight).toBe(false);
  });

  it('flags a hook in flight and a respawn countdown', () => {
    const dead = [fakePlayer({ id: HUMAN, status: { kind: 'dead', respawnAt: 12 } }), fakePlayer({ id: BOT, team: 'east' })];
    const hooks = [{ id: 'h' as HookId, ownerId: HUMAN, pos: { x: 0, y: 0 }, dir: { x: 1, y: 0 }, path: [], phase: { kind: 'retracting' as const, cargo: null }, stats: { damage: 350, range: 1300, speed: 1100, retractSpeed: 1300, radius: 26 } }];
    const view = deriveHud(fakeState({ time: 10, players: dead, hooks }), HUMAN, []);
    expect(view.local?.hookInFlight).toBe(true);
    expect(view.local?.respawnIn).toBeCloseTo(2);
  });

  it('builds the end panel with per-player kills and deaths', () => {
    const ended = fakeState({ players, phase: { kind: 'ended', winner: 'east' } });
    const view = deriveHud(ended, HUMAN, []);
    expect(view.end?.localWon).toBe(false);
    expect(view.end?.rows.map((r) => r.name)).toEqual(['You', 'Bot']);
  });
});

describe('appendKills', () => {
  it('puts the newest kill first and keeps the feed short', () => {
    const killState = (tick: number) =>
      fakeState({ tick, players, events: [{ kind: 'kill', killerId: HUMAN, victimId: BOT, assistIds: [], at: { x: 0, y: 0 } }] });
    let feed = appendKills([], killState(1));
    for (let t = 2; t <= 10; t += 1) feed = appendKills(feed, killState(t));
    expect(feed).toHaveLength(KILL_FEED_SIZE);
    expect(feed[0]?.key.startsWith('10-')).toBe(true);
    expect(feed[0]?.killer.name).toBe('You');
  });
});
