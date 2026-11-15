import { describe, expect, it } from 'vitest';
import { TUNING } from '@hookwars/sim';
import type { HookId, PickupId, PlayerId } from '@hookwars/sim';
import { BOT, fakePlayer, fakeView, HUMAN } from '../game/fakeSim';
import { appendFeed, cooldownLabel, deriveHud, KILL_FEED_SIZE, type FeedEntry } from './hudView';

const kills = (feed: readonly FeedEntry[]) => feed.flatMap((e) => (e.kind === 'kill' ? [e] : []));

const players = [
  fakePlayer({ id: HUMAN, name: 'You', hookReadyAt: 10.6 }),
  fakePlayer({ id: BOT, name: 'Bot', team: 'east', isBot: true }),
];

describe('deriveHud', () => {
  it('reports cooldown remaining as seconds and a fraction of the full cooldown', () => {
    const view = deriveHud(fakeView({ time: 10, players }), HUMAN, []);
    expect(view.local?.cooldownSeconds).toBeCloseTo(0.6);
    expect(view.local?.cooldownFraction).toBeCloseTo(0.6 / TUNING.hookCooldown);
    expect(view.local?.hookInFlight).toBe(false);
  });

  it('flags a hook in flight and a respawn countdown', () => {
    const dead = [fakePlayer({ id: HUMAN, status: { kind: 'dead', respawnAt: 12 } }), fakePlayer({ id: BOT, team: 'east' })];
    const hooks = [{ id: 'h' as HookId, ownerId: HUMAN, pos: { x: 0, y: 0 }, dir: { x: 1, y: 0 }, path: [], phase: { kind: 'retracting' as const, cargo: null }, stats: { damage: 350, range: 1300, speed: 1100, retractSpeed: 1300, radius: 26, barbed: false } }];
    const view = deriveHud(fakeView({ time: 10, players: dead, hooks }), HUMAN, []);
    expect(view.local?.hookInFlight).toBe(true);
    expect(view.local?.respawnIn).toBeCloseTo(2);
  });

  it('says who won once the match is over', () => {
    const ended = fakeView({ players, phase: { kind: 'ended', winner: 'east' } });
    expect(deriveHud(ended, HUMAN, []).end).toEqual({ winner: 'east', localWon: false });
    expect(deriveHud(fakeView({ players }), HUMAN, []).end).toBeNull();
  });

  it('lists every fighter by side with kills, deaths, assists and gold earned', () => {
    const roster = [
      fakePlayer({ id: HUMAN, name: 'You', kills: 2, deaths: 1, assists: 3, gold: 40, earned: 900 }),
      fakePlayer({ id: BOT, name: 'Pike', team: 'east', isBot: true }),
      fakePlayer({ id: 'ally' as PlayerId, name: 'Gull', isBot: true, assists: 4 }),
    ];
    const board = deriveHud(fakeView({ players: roster }), HUMAN, []).scoreboard;
    expect(board.west.map((r) => [r.name, r.isLocal])).toEqual([
      ['You', true],
      ['Gull (bot)', false],
    ]);
    expect(board.west[0]).toMatchObject({ kills: 2, deaths: 1, assists: 3, earned: 900 });
    expect(board.east.map((r) => r.name)).toEqual(['Pike (bot)']);
  });

  it('keeps hidden enemies on the board under fog with what they earned, and only our own purse to spend', () => {
    const far = [
      fakePlayer({ id: HUMAN, gold: 40 }),
      fakePlayer({ id: BOT, name: 'Pike', team: 'east', pos: { x: 2000, y: 0 }, kills: 3, gold: 77, earned: 750 }),
    ];
    const view = fakeView({ players: far, vision: { kind: 'fog', radius: 900 } });
    expect(view.players.map((p) => p.id)).toEqual([HUMAN]);
    const hud = deriveHud(view, HUMAN, []);
    expect(hud.scoreboard.east[0]).toMatchObject({ name: 'Pike', kills: 3, earned: 750 });
    expect(JSON.stringify(hud)).not.toContain('77');
    expect(hud.local?.gold).toBe(40);
  });

  it('shows the local gold, the shop and the grapple slot', () => {
    const rich = [fakePlayer({ id: HUMAN, gold: 1234 }), players[1]!];
    const view = deriveHud(fakeView({ players: rich }), HUMAN, []);
    expect(view.local?.gold).toBe(1234);
    expect(view.local?.grapple.kind).toBe('locked');
    expect(view.shop).toHaveLength(6);
  });

  it('marks the hook barbed once the barb is owned', () => {
    const plain = deriveHud(fakeView({ players }), HUMAN, []);
    expect(plain.local?.hookBarbed).toBe(false);
    const kitted = [fakePlayer({ id: HUMAN, items: { grapple: { kind: 'unowned' }, barb: { kind: 'owned' } } }), players[1]!];
    expect(deriveHud(fakeView({ players: kitted }), HUMAN, []).local?.hookBarbed).toBe(true);
  });
});

describe('appendFeed', () => {
  it('puts the newest kill first and keeps the feed short', () => {
    const killState = (tick: number) =>
      fakeView({ tick, players, events: [{ kind: 'kill', killerId: HUMAN, victimId: BOT, assistIds: [], at: { x: 0, y: 0 } }] });
    let feed = appendFeed([], killState(1));
    for (let t = 2; t <= 10; t += 1) feed = appendFeed(feed, killState(t));
    expect(feed).toHaveLength(KILL_FEED_SIZE);
    expect(feed[0]?.key.startsWith('10-')).toBe(true);
    expect(kills(feed)[0]?.killer.name).toBe('You');
    expect(kills(feed)[0]?.victim.name).toBe('Bot (bot)');
  });

  it('lists a kill once even when the same state is seen twice', () => {
    const state = fakeView({ tick: 7, players, events: [{ kind: 'kill', killerId: HUMAN, victimId: BOT, assistIds: [], at: { x: 0, y: 0 } }] });
    const once = appendFeed([], state);
    expect(appendFeed(once, state)).toEqual(once);
  });

  it('names everyone who assisted', () => {
    const ally = fakePlayer({ id: 'ally' as PlayerId, name: 'Ally' });
    const state = fakeView({
      players: [...players, ally],
      events: [{ kind: 'kill', killerId: HUMAN, victimId: BOT, assistIds: [ally.id], at: { x: 0, y: 0 } }],
    });
    expect(kills(appendFeed([], state))[0]?.assisters).toEqual([{ name: 'Ally', team: 'west' }]);
  });

  it('adds a line for a collected pickup, naming a bot collector with its suffix', () => {
    const state = fakeView({ tick: 3, players, events: [{ kind: 'pickupCollected', pickupId: 'p2' as PickupId, pickupKind: 'storm', playerId: BOT, gold: 0 }] });
    expect(appendFeed([], state)).toEqual([{ kind: 'pickup', key: '3-p2', collector: { name: 'Bot (bot)', team: 'east' }, pickup: 'storm', gold: 0 }]);
  });
});

describe('active effects', () => {
  it('lists each effect on the local fighter with the whole seconds it has left', () => {
    const galed = [fakePlayer({ id: HUMAN, effects: [{ kind: 'gale', source: HUMAN, since: 9, until: 17 }] }), players[1]!];
    expect(deriveHud(fakeView({ time: 10.2, players: galed }), HUMAN, []).local?.effects).toEqual([{ kind: 'gale', name: 'Gale', secondsLeft: 7 }]);
    expect(deriveHud(fakeView({ players }), HUMAN, []).local?.effects).toEqual([]);
  });
});

describe('cooldownLabel', () => {
  it('never shows zero while time is still left', () => {
    expect(cooldownLabel(0.6)).toBe('0.6s');
    expect(cooldownLabel(0.04)).toBe('0.1s');
    expect(cooldownLabel(1.01)).toBe('1.1s');
  });
});
