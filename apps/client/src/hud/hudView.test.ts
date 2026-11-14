import { describe, expect, it } from 'vitest';
import { TUNING } from '@hookbrawl/sim';
import type { HookId, PlayerId } from '@hookbrawl/sim';
import { BOT, fakePlayer, fakeState, HUMAN } from '../game/fakeSim';
import { appendKills, cooldownLabel, deriveHud, KILL_FEED_SIZE } from './hudView';

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
    const hooks = [{ id: 'h' as HookId, ownerId: HUMAN, pos: { x: 0, y: 0 }, dir: { x: 1, y: 0 }, path: [], phase: { kind: 'retracting' as const, cargo: null }, stats: { damage: 350, range: 1300, speed: 1100, retractSpeed: 1300, radius: 26, barbed: false } }];
    const view = deriveHud(fakeState({ time: 10, players: dead, hooks }), HUMAN, []);
    expect(view.local?.hookInFlight).toBe(true);
    expect(view.local?.respawnIn).toBeCloseTo(2);
  });

  it('builds the end panel with per-player kills, deaths and assists', () => {
    const scored = [fakePlayer({ id: HUMAN, name: 'You', kills: 2, deaths: 1, assists: 3 }), players[1]!];
    const ended = fakeState({ players: scored, phase: { kind: 'ended', winner: 'east' } });
    const view = deriveHud(ended, HUMAN, []);
    expect(view.end?.localWon).toBe(false);
    expect(view.end?.rows.map((r) => r.name)).toEqual(['You', 'Bot']);
    expect(view.end?.rows[0]).toMatchObject({ kills: 2, deaths: 1, assists: 3 });
  });

  it('shows the local gold, the shop and the grapple slot', () => {
    const rich = [fakePlayer({ id: HUMAN, gold: 1234 }), players[1]!];
    const view = deriveHud(fakeState({ players: rich }), HUMAN, []);
    expect(view.local?.gold).toBe(1234);
    expect(view.local?.grapple.kind).toBe('locked');
    expect(view.shop).toHaveLength(6);
  });

  it('marks the hook barbed once the barb is owned', () => {
    const plain = deriveHud(fakeState({ players }), HUMAN, []);
    expect(plain.local?.hookBarbed).toBe(false);
    const kitted = [fakePlayer({ id: HUMAN, items: { grapple: { kind: 'unowned' }, barb: { kind: 'owned' } } }), players[1]!];
    expect(deriveHud(fakeState({ players: kitted }), HUMAN, []).local?.hookBarbed).toBe(true);
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

  it('lists a kill once even when the same state is seen twice', () => {
    const state = fakeState({ tick: 7, players, events: [{ kind: 'kill', killerId: HUMAN, victimId: BOT, assistIds: [], at: { x: 0, y: 0 } }] });
    const once = appendKills([], state);
    expect(appendKills(once, state)).toEqual(once);
  });

  it('names everyone who assisted', () => {
    const ally = fakePlayer({ id: 'ally' as PlayerId, name: 'Ally' });
    const state = fakeState({
      players: [...players, ally],
      events: [{ kind: 'kill', killerId: HUMAN, victimId: BOT, assistIds: [ally.id], at: { x: 0, y: 0 } }],
    });
    expect(appendKills([], state)[0]?.assisters).toEqual([{ name: 'Ally', team: 'west' }]);
  });
});

describe('cooldownLabel', () => {
  it('never shows zero while time is still left', () => {
    expect(cooldownLabel(0.6)).toBe('0.6s');
    expect(cooldownLabel(0.04)).toBe('0.1s');
    expect(cooldownLabel(1.01)).toBe('1.1s');
  });
});
