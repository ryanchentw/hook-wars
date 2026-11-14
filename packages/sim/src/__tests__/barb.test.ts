import { describe, expect, it } from 'vitest';
import { canBuy, hookStats, ITEMS, priceOf, step, TICK_DT, TUNING } from '../index';
import type { GameState, PlayerInput, Purchase, TeamId, Vec2 } from '../index';
import { at, barbed, buy, match, ofKind, pid, player, run, runUntil, toward, withPlayer } from './helpers';

const BARB: Purchase = { kind: 'item', id: 'barb' };
const OWNER = at(420, 335);
const THROW = at(1600, 335);
/** Off the outgoing line, and off the return line unless the owner walks south while the hook is out. */
const OFF_LINE = at(900, 565);
const reach = TUNING.playerRadius + TUNING.hookRadius;

function lane(others: readonly (readonly [string, TeamId, Vec2])[]): GameState {
  const roster = [['w', 'west'] as const, ['far', 'east'] as const, ...others.map(([id, team]) => [id, team] as const)];
  const placed: readonly (readonly [string, Vec2])[] = [['w', OWNER], ['far', at(2300, 1300)], ...others.map(([id, , pos]) => [id, pos] as const)];
  return placed.reduce((s, [id, pos]) => withPlayer(s, id, { pos }), match(roster));
}

const throwAt = (target: Vec2): PlayerInput[] => [{ kind: 'hook', playerId: pid('w'), target }];
const walkSouth = (s: GameState): GameState => withPlayer(s, 'w', { move: toward(at(420, 700)) });
const noHooks = (s: GameState): boolean => s.hooks.length === 0;

/** Throws east along the owner's row while the owner walks south, then plays until the hook is home. */
function throwAndWalk(s: GameState) {
  return runUntil(walkSouth(step(s, throwAt(THROW), TICK_DT)), noHooks, 200);
}

describe('barb in the shop', () => {
  it('costs 450, once, and owning it is passive: no cooldown to track', () => {
    const p = player(lane([]), 'w');
    expect(ITEMS.barb.cost).toBe(450);
    expect(priceOf(p, BARB)).toBe(450);
    expect(canBuy({ ...p, gold: 449 }, BARB)).toBe(false);
    const after = step(withPlayer(lane([]), 'w', { gold: 450 }), [buy('w', BARB)], TICK_DT);
    expect(player(after, 'w')).toMatchObject({ gold: 0, items: { barb: { kind: 'owned' } } });
    expect(player(after, 'w').items.barb).toEqual({ kind: 'owned' });
    expect(priceOf(player(after, 'w'), BARB)).toBeNull();
  });

  it('marks the hook stats barbed', () => {
    const s = lane([]);
    expect(hookStats(player(s, 'w')).barbed).toBe(false);
    expect(hookStats(player(barbed(s, 'w'), 'w')).barbed).toBe(true);
  });
});

describe('a returning hook', () => {
  it('without the barb passes over an enemy on its way back', () => {
    const { state, events } = throwAndWalk(lane([['e', 'east', OFF_LINE]]));
    expect(ofKind(events, 'hookHit')).toEqual([]);
    expect(player(state, 'e')).toMatchObject({ hp: TUNING.maxHp, status: { kind: 'alive' } });
  });

  it('with the barb misses when the owner stands still and the line never crosses the enemy', () => {
    const s = barbed(lane([['e', 'east', OFF_LINE]]), 'w');
    const { events } = runUntil(step(s, throwAt(THROW), TICK_DT), noHooks, 200);
    expect(ofKind(events, 'hookHit')).toEqual([]);
  });

  it('with the barb catches an enemy the owner walked the return line across', () => {
    const s = barbed(lane([['e', 'east', OFF_LINE]]), 'w');
    const caught = runUntil(walkSouth(step(s, throwAt(THROW), TICK_DT)), (x) => x.events.some((e) => e.kind === 'hookHit'), 200);
    const [hit] = ofKind(caught.events, 'hookHit');
    expect(hit).toMatchObject({ ownerId: 'w', targetId: 'e', damage: TUNING.hookDamage, ally: false });
    expect(Math.hypot((hit?.at.x ?? 0) - OFF_LINE.x, (hit?.at.y ?? 0) - OFF_LINE.y)).toBeCloseTo(reach, 6);
    const e = player(caught.state, 'e');
    expect(e).toMatchObject({ hp: TUNING.maxHp - TUNING.hookDamage, status: { kind: 'dragged' }, move: { kind: 'idle' } });
    expect(e.recentDamage).toEqual([{ from: 'w', at: expect.any(Number) }]);
    expect(caught.state.hooks[0]?.phase).toEqual({ kind: 'retracting', cargo: 'e' });

    const home = runUntil(caught.state, noHooks, 200);
    const w = player(home.state, 'w');
    const set = player(home.state, 'e');
    expect(set.status.kind).toBe('staggered');
    expect(Math.hypot(set.pos.x - w.pos.x, set.pos.y - w.pos.y)).toBeLessThanOrEqual(TUNING.bodySpacing + 1e-6);
    expect(ofKind(home.events, 'melee')).toEqual([expect.objectContaining({ attackerId: 'w', targetId: 'e' })]);
  });

  it('with the barb passes over a teammate', () => {
    const s = barbed(lane([['ally', 'west', OFF_LINE], ['e', 'east', at(1980, 1015)]]), 'w');
    const { state, events } = throwAndWalk(s);
    expect(ofKind(events, 'hookHit')).toEqual([]);
    expect(player(state, 'ally')).toMatchObject({ hp: TUNING.maxHp, status: { kind: 'alive' } });
  });

  it('bought while the hook is out leaves that hook unbarbed', () => {
    const s = withPlayer(lane([['e', 'east', OFF_LINE]]), 'w', { gold: ITEMS.barb.cost });
    const thrown = step(step(s, throwAt(THROW), TICK_DT), [buy('w', BARB)], TICK_DT);
    expect(player(thrown, 'w').items.barb.kind).toBe('owned');
    expect(thrown.hooks[0]?.stats.barbed).toBe(false);
    const { events } = runUntil(walkSouth(thrown), noHooks, 200);
    expect(ofKind(events, 'hookHit')).toEqual([]);
  });

  it('with the barb catches again once the enemy it was dragging dies', () => {
    const s = barbed(lane([['e', 'east', at(900, 335)], ['e2', 'east', at(1980, 1015)]]), 'w');
    const doomed = withPlayer(s, 'e', { hp: TUNING.hookDamage });
    const killed = runUntil(step(doomed, throwAt(THROW), TICK_DT), (x) => x.events.some((e) => e.kind === 'kill'), 60).state;
    const hook = killed.hooks[0];
    expect(hook?.phase).toEqual({ kind: 'retracting', cargo: null });
    const onTheLine = withPlayer(killed, 'e2', { pos: at(((hook?.pos.x ?? 0) + OWNER.x) / 2, OWNER.y) });
    const { state, events } = runUntil(onTheLine, (x) => player(x, 'e2').status.kind === 'dragged', 60);
    expect(ofKind(events, 'hookHit')[0]).toMatchObject({ targetId: 'e2', damage: TUNING.hookDamage });
    expect(player(state, 'e2').status.kind).toBe('dragged');
  });

  it('carrying cargo does not catch a second enemy on the way back', () => {
    const s = barbed(lane([['e', 'east', at(900, 335)], ['e2', 'east', at(1980, 1015)]]), 'w');
    const hit = runUntil(step(s, throwAt(THROW), TICK_DT), (x) => player(x, 'e').status.kind === 'dragged', 60).state;
    const onTheLine = withPlayer(hit, 'e2', { pos: at(650, OWNER.y) });
    const { events, state } = run(onTheLine, 40);
    expect(ofKind(events, 'hookHit')).toEqual([]);
    expect(player(state, 'e2').status.kind).toBe('alive');
  });
});
