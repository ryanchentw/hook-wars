import { describe, expect, it } from 'vitest';
import { PICKUPS, step, TICK_DT, TUNING } from '../index';
import type { GameState, Vec2 } from '../index';
import { armed, at, barbed, grapple, hook, hookOf, match, ofKind, player, run, runUntil, toward, withPickup, withPlayer } from './helpers';

const W = at(420, 335);
const ON_LINE = at(1100, 335);
const BEHIND = at(1600, 335);
const noHooks = (s: GameState): boolean => s.hooks.length === 0;

/** `w` on the west dock facing a gold pickup on its row, `e` straight behind the pickup on the east dock. */
function lane(kind: 'gold' | 'gale' | 'storm' = 'gold', pickupAt: Vec2 = ON_LINE): GameState {
  const roster = [['w', 'west'], ['e', 'east'], ['e2', 'east']] as const;
  const placed = withPlayer(withPlayer(withPlayer(match(roster), 'w', { pos: W }), 'e', { pos: BEHIND }), 'e2', { pos: at(2300, 1300) });
  return withPickup(placed, kind, pickupAt);
}

describe('a hook meeting a pickup', () => {
  it('stops at it on the way out and the fighter behind is untouched', () => {
    const { state, events } = runUntil(step(lane(), [hook('w', BEHIND)], TICK_DT), noHooks, 200);
    expect(ofKind(events, 'hookHit')).toEqual([]);
    expect(ofKind(events, 'pickupCaught')).toEqual([expect.objectContaining({ ownerId: 'w', pickupKind: 'gold' })]);
    expect(player(state, 'e')).toMatchObject({ hp: TUNING.maxHp, status: { kind: 'alive' } });
  });

  it('carries it home at the head, and it counts only once it reaches the hand', () => {
    const caught = runUntil(step(lane(), [hook('w', BEHIND)], TICK_DT), (s) => s.events.some((e) => e.kind === 'pickupCaught'), 60).state;
    const h = caught.hooks[0]!;
    expect(h.phase).toEqual({ kind: 'retracting', cargo: { kind: 'pickup', id: 'p0' } });
    expect(caught.pickups[0]).toMatchObject({ state: { kind: 'carried', hookId: h.id }, pos: h.pos });
    const halfway = run(caught, 10);
    expect(ofKind(halfway.events, 'pickupCollected')).toEqual([]);
    expect(player(halfway.state, 'w').gold).toBe(player(caught, 'w').gold);
    expect(halfway.state.pickups[0]?.pos).toEqual(halfway.state.hooks[0]?.pos);

    const home = runUntil(halfway.state, noHooks, 200);
    expect(ofKind(home.events, 'pickupCollected')).toEqual([{ kind: 'pickupCollected', pickupId: 'p0', pickupKind: 'gold', playerId: 'w', gold: PICKUPS.gold }]);
    expect(home.state.pickups).toEqual([]);
  });

  it('can be taken off a hook by another hook, which carries it to its own thrower', () => {
    const caught = runUntil(step(lane('gale'), [hook('w', BEHIND)], TICK_DT), (x) => x.pickups[0]?.state.kind === 'carried', 60).state;
    const carried = caught.pickups[0]!;
    const robbed = caught.hooks[0]!;
    const crossing = hookOf('e', at(carried.pos.x, carried.pos.y + 85), { dir: at(0, -1), path: [player(caught, 'e').pos] });
    const stolen = run({ ...caught, hooks: [crossing, robbed] }, 1).state;
    expect(stolen.pickups[0]?.state).toEqual({ kind: 'carried', hookId: crossing.id });
    expect(stolen.hooks.find((h) => h.id === robbed.id)?.phase).toEqual({ kind: 'retracting', cargo: null });

    const home = runUntil(stolen, noHooks, 300);
    expect(ofKind(home.events, 'pickupCollected')).toEqual([expect.objectContaining({ playerId: 'e', pickupKind: 'gale' })]);
    expect(player(home.state, 'e').effects.map((e) => e.kind)).toEqual(['gale']);
    expect(player(home.state, 'w').effects).toEqual([]);
  });

  /** `w` throws east along its row and walks south, so the hook comes home across a Storm floating up the water. */
  function throwAndWalk(barb: boolean) {
    const s = withPlayer(lane('storm', at(1050, 565)), 'e', { pos: at(1980, 1015) });
    const placed = { ...s, pickups: s.pickups.map((p) => ({ ...p, from: 'south' as const })) };
    const thrown = withPlayer(step(barb ? barbed(placed, 'w') : placed, [hook('w', at(1600, 335))], TICK_DT), 'w', { move: toward(at(420, 700)) });
    return runUntil(thrown, noHooks, 300);
  }

  it('is caught by a barbed hook on its way back, by the same rule as a fighter', () => {
    const { state, events } = throwAndWalk(true);
    expect(ofKind(events, 'pickupCaught')).toEqual([expect.objectContaining({ ownerId: 'w', pickupKind: 'storm' })]);
    expect(ofKind(events, 'pickupCollected')).toEqual([expect.objectContaining({ playerId: 'w' })]);
    expect(state.pickups).toEqual([]);
  });

  it('is passed over by a returning hook without the barb', () => {
    expect(ofKind(throwAndWalk(false).events, 'pickupCaught')).toEqual([]);
  });

  it('is ignored by a grapple', () => {
    const s = armed(withPlayer(lane('gold', at(1100, 335)), 'e', { pos: at(1500, 335) }), 'w');
    const { state, events } = run(step(s, [grapple('w', at(1700, 335))], TICK_DT), 90);
    expect(ofKind(events, 'grappleArrive')).toHaveLength(1);
    expect(ofKind(events, 'pickupCaught')).toEqual([]);
    expect(state.pickups[0]?.state).toEqual({ kind: 'drifting' });
  });

  it('sinks with the hook of a thrower who dies before it reaches the hand', () => {
    const caught = runUntil(step(lane(), [hook('w', BEHIND)], TICK_DT), (s) => s.pickups[0]?.state.kind === 'carried', 60).state;
    const dead = withPlayer(caught, 'w', { status: { kind: 'dead', respawnAt: caught.time + 3 } });
    const { state, events } = run(dead, 2);
    expect(state.pickups).toEqual([]);
    expect(state.hooks[0]?.phase).toEqual({ kind: 'retracting', cargo: null });
    expect(ofKind(events, 'pickupCollected')).toEqual([]);
  });
});
