import { describe, expect, it } from 'vitest';
import type { Grapple, GrappleId, Hook, HookId } from '@hookwars/sim';
import { BOT, fakePlayer, fakeView, HUMAN } from '../game/fakeSim';
import { interpolateFrame } from './interpolate';

const hookId = 'h1' as HookId;
const grappleId = 'g1' as GrappleId;

function grapple(overrides: Partial<Grapple>): Grapple {
  return { id: grappleId, ownerId: HUMAN, pos: { x: 0, y: 0 }, anchor: { x: 600, y: 0 }, phase: { kind: 'flying' }, ...overrides };
}

function hook(overrides: Partial<Hook>): Hook {
  return {
    id: hookId,
    ownerId: HUMAN,
    pos: { x: 0, y: 0 },
    dir: { x: 1, y: 0 },
    path: [{ x: 0, y: 0 }],
    phase: { kind: 'extending', remaining: 1000 },
    stats: { damage: 350, range: 1300, speed: 1100, retractSpeed: 1300, radius: 26, barbed: false },
    ...overrides,
  };
}

describe('interpolateFrame', () => {
  it('blends player positions by alpha', () => {
    const previous = fakeView({ players: [fakePlayer({ id: HUMAN, pos: { x: 0, y: 0 } })] });
    const current = fakeView({ players: [fakePlayer({ id: HUMAN, pos: { x: 10, y: 20 } })] });
    const frame = interpolateFrame({ previous, current, alpha: 0.25 });
    expect(frame.players[0]?.pos).toEqual({ x: 2.5, y: 5 });
  });

  it('snaps a respawning player instead of sliding across the map', () => {
    const previous = fakeView({ players: [fakePlayer({ id: HUMAN, pos: { x: 900, y: 600 }, status: { kind: 'dead', respawnAt: 3 } })] });
    const current = fakeView({ players: [fakePlayer({ id: HUMAN, pos: { x: 420, y: 675 } })] });
    expect(interpolateFrame({ previous, current, alpha: 0.5 }).players[0]?.pos).toEqual({ x: 420, y: 675 });
  });

  it('draws an extending chain through every bounce point to the head', () => {
    const path = [{ x: 0, y: 0 }, { x: 100, y: 100 }];
    const previous = fakeView({ hooks: [hook({ path, pos: { x: 100, y: 200 } })] });
    const current = fakeView({ hooks: [hook({ path, pos: { x: 100, y: 300 } })] });
    const hf = interpolateFrame({ previous, current, alpha: 0.5 }).hooks[0];
    expect(hf?.head).toEqual({ x: 100, y: 250 });
    expect(hf?.chain).toEqual([...path, { x: 100, y: 250 }]);
    expect(hf?.team).toBe('west');
  });

  it('keeps an extending chain in the hand of a thrower who has walked on since the cast', () => {
    const players = [fakePlayer({ id: HUMAN, pos: { x: 40, y: -30 } })];
    const path = [{ x: 0, y: 0 }, { x: 100, y: 100 }];
    const state = fakeView({ players, hooks: [hook({ path, pos: { x: 100, y: 300 } })] });
    const hf = interpolateFrame({ previous: state, current: state, alpha: 1 }).hooks[0];
    expect(hf?.chain).toEqual([{ x: 40, y: -30 }, { x: 100, y: 100 }, { x: 100, y: 300 }]);
  });

  it('draws a retracting chain straight from the owner to the head', () => {
    const players = [fakePlayer({ id: HUMAN, pos: { x: 50, y: 60 } }), fakePlayer({ id: BOT, team: 'east' })];
    const retracting = hook({ pos: { x: 500, y: 60 }, path: [{ x: 0, y: 0 }, { x: 300, y: 300 }], phase: { kind: 'retracting', cargo: null } });
    const state = fakeView({ players, hooks: [retracting] });
    const hf = interpolateFrame({ previous: state, current: state, alpha: 1 }).hooks[0];
    expect(hf?.chain).toEqual([{ x: 50, y: 60 }, { x: 500, y: 60 }]);
  });

  it('flies a grapple head between ticks by alpha, in its thrower\'s colour', () => {
    const previous = fakeView({ grapples: [grapple({ pos: { x: 100, y: 0 } })] });
    const current = fakeView({ grapples: [grapple({ pos: { x: 160, y: 0 } })] });
    const gf = interpolateFrame({ previous, current, alpha: 0.5 }).grapples[0];
    expect(gf?.head).toEqual({ x: 130, y: 0 });
    expect(gf?.team).toBe('west');
  });

  it('starts a grapple cast this tick at its head, with nothing to blend from', () => {
    const current = fakeView({ grapples: [grapple({ pos: { x: 40, y: 0 } })] });
    expect(interpolateFrame({ previous: fakeView(), current, alpha: 0.5 }).grapples[0]?.head).toEqual({ x: 40, y: 0 });
  });

  it('pins a pulling grapple at its anchor while the hauled owner closes on it', () => {
    const pulling = grapple({ pos: { x: 600, y: 0 }, phase: { kind: 'pulling' } });
    const previous = fakeView({ players: [fakePlayer({ id: HUMAN, pos: { x: 200, y: 0 } })], grapples: [pulling] });
    const current = fakeView({ players: [fakePlayer({ id: HUMAN, pos: { x: 230, y: 0 } })], grapples: [pulling] });
    const frame = interpolateFrame({ previous, current, alpha: 0.5 });
    expect(frame.grapples[0]?.head).toEqual({ x: 600, y: 0 });
    expect(frame.players[0]?.pos).toEqual({ x: 215, y: 0 });
  });
});
