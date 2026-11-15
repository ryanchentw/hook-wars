import { describe, expect, it } from 'vitest';
import { EFFECTS, ECONOMY, PICKUPS, step, TICK_DT, TUNING } from '../index';
import type { GameState, PickupKind } from '../index';
import { at, hook, match, ofKind, player, run, runUntil, withPickup, withPlayer } from './helpers';

const W = at(420, 335);
const ROSTER = [['w', 'west'], ['w2', 'west'], ['e', 'east'], ['e2', 'east']] as const;
const ticksFor = (seconds: number): number => Math.round(seconds / TICK_DT);

/** `w` has just brought a `kind` pickup home; the enemies stand far off on the east dock. */
function collected(kind: PickupKind, patch: (s: GameState) => GameState = (s) => s): GameState {
  const placed = withPlayer(withPlayer(withPlayer(withPlayer(match(ROSTER), 'w', { pos: W }), 'w2', { pos: at(420, 1015) }), 'e', { pos: at(1980, 335) }), 'e2', { pos: at(1980, 1015) });
  const s = patch(withPickup(placed, kind, at(1100, 335)));
  return runUntil(step(s, [hook('w', at(1600, 335))], TICK_DT), (x) => x.events.some((e) => e.kind === 'pickupCollected'), 200).state;
}

describe('Gold', () => {
  it('pays the collector at once, and counts toward what they earned', () => {
    const before = player(match(ROSTER), 'w');
    const s = collected('gold');
    const elapsed = Math.floor(s.time + 1e-6) * ECONOMY.passiveGold;
    expect(player(s, 'w').gold).toBe(before.gold + elapsed + PICKUPS.gold);
    expect(player(s, 'w').earned).toBe(before.earned + elapsed + PICKUPS.gold);
    expect(player(s, 'w2').gold).toBe(before.gold + elapsed);
  });
});

describe('Gale', () => {
  it('speeds the collector\'s walk by the configured share while it lasts, then ends', () => {
    const s = collected('gale');
    expect(player(s, 'w').effects).toEqual([{ kind: 'gale', source: 'w', since: expect.any(Number), until: expect.closeTo(s.time - TICK_DT + EFFECTS.gale.duration, 6) }]);
    const walking = withPlayer(s, 'w', { move: { kind: 'steer', dir: at(0, 1) } });
    const second = run(walking, ticksFor(1)).state;
    expect(player(second, 'w').pos.y - player(walking, 'w').pos.y).toBeCloseTo(TUNING.moveSpeed * EFFECTS.gale.moveScale, 3);
    const over = withPlayer(run(walking, ticksFor(EFFECTS.gale.duration)).state, 'w', { pos: W });
    expect(player(over, 'w').effects).toEqual([]);
    const after = run(over, ticksFor(1)).state;
    expect(player(after, 'w').pos.y - W.y).toBeCloseTo(TUNING.moveSpeed, 3);
  });

  it('makes the hooks thrown under it fly and retract faster, and a hook in the air keeps the speed it was thrown at', () => {
    const s = collected('gale');
    const ready = withPlayer(s, 'w', { hookReadyAt: 0 });
    const thrown = step(ready, [hook('w', at(1600, 335))], TICK_DT).hooks[0]!;
    expect(thrown.stats.speed).toBeCloseTo(TUNING.hookSpeed * EFFECTS.gale.hookScale, 6);
    expect(thrown.stats.retractSpeed).toBeCloseTo(TUNING.hookRetractSpeed * EFFECTS.gale.hookScale, 6);
    const lapsed = withPlayer(step(ready, [hook('w', at(1600, 335))], TICK_DT), 'w', { effects: [] });
    expect(run(lapsed, 3).state.hooks[0]?.stats.speed).toBeCloseTo(TUNING.hookSpeed * EFFECTS.gale.hookScale, 6);
  });
});

describe('Storm', () => {
  const spec = EFFECTS.storm.pulse!;
  const pulses = Math.round(EFFECTS.storm.duration / spec.interval);

  it('strikes every living enemy for the configured damage each interval, for its duration, and spares the collector\'s team', () => {
    const s = collected('storm');
    expect(player(s, 'e').effects.map((e) => e.kind)).toEqual(['storm']);
    expect(player(s, 'w').effects).toEqual([]);
    const { state, events } = run(s, ticksFor(EFFECTS.storm.duration + 2));
    expect(player(state, 'e').hp).toBe(TUNING.maxHp - pulses * spec.damage);
    expect(player(state, 'e2').hp).toBe(TUNING.maxHp - pulses * spec.damage);
    expect(player(state, 'w2').hp).toBe(TUNING.maxHp);
    expect(ofKind(events, 'storm').filter((e) => e.targetId === 'e')).toHaveLength(pulses);
    expect(ofKind(events, 'storm').every((e) => e.sourceId === 'w' && e.damage === spec.damage)).toBe(true);
    expect(player(state, 'e').effects).toEqual([]);
  });

  it('kills, crediting the collector, with an assist for an enemy of the victim who hurt them lately', () => {
    const s = collected('storm');
    const hurt = withPlayer(s, 'e', { hp: spec.damage, recentDamage: [{ from: 'w2' as never, at: s.time }] });
    const { state, events } = runUntil(hurt, (x) => x.events.some((e) => e.kind === 'kill'), ticksFor(2));
    expect(ofKind(events, 'kill')).toEqual([expect.objectContaining({ killerId: 'w', victimId: 'e', assistIds: ['w2'] })]);
    expect(player(state, 'w').kills).toBe(1);
    expect(player(state, 'w2').assists).toBe(1);
    expect(state.score.west).toBe(1);
    expect(player(state, 'e').effects).toEqual([]);
  });

  it('leaves alone an enemy dead when it was collected, who respawns while it lasts', () => {
    const s = collected('storm', (x) => withPlayer(x, 'e2', { status: { kind: 'dead', respawnAt: 2 }, hp: 0 }));
    expect(player(s, 'e2').effects).toEqual([]);
    const { state, events } = run(s, ticksFor(EFFECTS.storm.duration + 1));
    expect(player(state, 'e2')).toMatchObject({ status: { kind: 'alive' }, hp: TUNING.maxHp });
    expect(ofKind(events, 'storm').some((e) => e.targetId === 'e2')).toBe(false);
  });
});
