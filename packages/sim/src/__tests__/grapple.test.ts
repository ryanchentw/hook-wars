import { describe, expect, it } from 'vitest';
import { GRAPPLE, ITEMS, step, TICK_DT, TUNING } from '../index';
import type { GameState, Vec2 } from '../index';
import { armed, at, grapple, match, ofKind, pid, player, run, runUntil, steer, withPlayer } from './helpers';

function duel(w: Vec2, e: Vec2, extra: readonly [string, Vec2][] = []): GameState {
  const roster = [['w', 'west'] as const, ['e', 'east'] as const, ...extra.map(([id]) => [id, 'west'] as const)];
  const placed = [['w', w] as const, ['e', e] as const, ...extra];
  return armed(placed.reduce((s, [id, pos]) => withPlayer(s, id, { pos }), match(roster)), 'w');
}

const arrived = (s: GameState) => player(s, 'w').status.kind === 'staggered';
const readyAt = (s: GameState): number => {
  const item = player(s, 'w').items.grapple;
  return item.kind === 'owned' ? item.readyAt : Number.NaN;
};

describe('grapple', () => {
  it('flies to the anchor, hauls its owner across the canal, then starts the cooldown', () => {
    const s0 = duel(at(1600, 675), at(2300, 1250));
    const cast = step(s0, [grapple('w', at(420, 675))], TICK_DT);
    const [g] = cast.grapples;
    expect(ofKind(cast.events, 'grappleCast')).toEqual([{ kind: 'grappleCast', grappleId: g?.id, ownerId: 'w' }]);
    expect(player(cast, 'w').status).toEqual({ kind: 'grappling', grappleId: g?.id });
    expect(g).toMatchObject({ ownerId: 'w', anchor: at(420, 675), phase: { kind: 'flying' } });

    const landed = runUntil(cast, (s) => s.grapples[0]?.phase.kind === 'pulling', 60);
    expect(ofKind(landed.events, 'grappleLand')).toEqual([{ kind: 'grappleLand', grappleId: g?.id, at: at(420, 675) }]);
    expect(player(landed.state, 'w').pos).toEqual(at(1600, 675));
    expect(landed.state.tick - s0.tick).toBe(Math.ceil((1600 - 420) / (GRAPPLE.flightSpeed * TICK_DT)));

    const midway = run(landed.state, 10).state;
    expect(player(midway, 'w').pos.x).toBeCloseTo(1600 - 10 * GRAPPLE.pullSpeed * TICK_DT, 6);

    const home = runUntil(landed.state, arrived, 120);
    expect(ofKind(home.events, 'grappleArrive')).toEqual([{ kind: 'grappleArrive', playerId: 'w', at: at(420, 675) }]);
    expect(player(home.state, 'w').pos).toEqual(at(420, 675));
    expect(home.state.grapples).toEqual([]);
    expect(readyAt(home.state)).toBeCloseTo(home.state.time - TICK_DT + ITEMS.grapple.cooldown, 9);
  });

  it('passes over the canal on the way', () => {
    const cast = step(duel(at(1600, 675), at(2300, 1250)), [grapple('w', at(420, 675))], TICK_DT);
    const xs: number[] = [];
    let s = cast;
    while (!arrived(s)) {
      s = step(s, [], TICK_DT);
      xs.push(player(s, 'w').pos.x);
    }
    expect(xs.some((x) => x > s.arena.canal.x0 && x < s.arena.canal.x1)).toBe(true);
  });

  it('anchors at most GRAPPLE.range away, on the nearest walkable dock point', () => {
    const far = step(duel(at(420, 675), at(2300, 1250)), [grapple('w', at(2366, 675))], TICK_DT);
    expect(far.grapples[0]?.anchor).toEqual(at(420 + GRAPPLE.range, 675));
    const canal = step(duel(at(900, 675), at(2300, 1250)), [grapple('w', at(1300, 675))], TICK_DT);
    expect(canal.grapples[0]?.anchor).toEqual(at(canal.arena.canal.x1 + TUNING.playerRadius, 675));
  });

  it('an anchor within bodySpacing is a no-op that costs no cooldown', () => {
    const s0 = duel(at(900, 675), at(2300, 1250));
    const after = step(s0, [grapple('w', at(1100, 675))], TICK_DT);
    expect(after.grapples).toEqual([]);
    expect(player(after, 'w').status).toEqual({ kind: 'alive' });
    expect(readyAt(after)).toBe(0);
    expect(ofKind(after.events, 'grappleCast')).toEqual([]);
  });

  it('needs the item, readiness, life, and no hook out', () => {
    const s0 = duel(at(420, 675), at(2300, 1250));
    const target = at(420, 100);
    const blocked: GameState[] = [
      withPlayer(s0, 'w', { items: { grapple: { kind: 'unowned' }, barb: { kind: 'unowned' } } }),
      withPlayer(s0, 'w', { items: { grapple: { kind: 'owned', readyAt: 5 }, barb: { kind: 'unowned' } } }),
      withPlayer(s0, 'w', { status: { kind: 'dead', respawnAt: 5 } }),
      step(s0, [{ kind: 'hook', playerId: pid('w'), target: at(900, 675) }], TICK_DT),
      step(s0, [grapple('w', target)], TICK_DT),
    ];
    blocked.forEach((s) => {
      expect(ofKind(step(s, [grapple('w', at(900, 1200))], TICK_DT).events, 'grappleCast')).toEqual([]);
    });
  });

  it('a grappling owner stands still, keeps a held steer, and walks on once the landing stagger passes', () => {
    const s0 = step(duel(at(420, 1200), at(2300, 1250)), [steer('w', 1, 0), grapple('w', at(420, 100))], TICK_DT);
    const flying = run(s0, 5).state;
    expect(player(flying, 'w').pos).toEqual(at(420, 1200));
    const home = runUntil(flying, arrived, 120).state;
    expect(player(home, 'w').move).toEqual({ kind: 'steer', dir: at(1, 0) });
    const recovered = run(home, Math.ceil(TUNING.landingStagger / TICK_DT) + 2).state;
    expect(player(recovered, 'w').status.kind).toBe('alive');
    expect(player(recovered, 'w').pos.x).toBeGreaterThan(player(home, 'w').pos.x);
  });

  it('a grappling owner cannot throw a hook or swing, but can be struck', () => {
    const s0 = withPlayer(duel(at(420, 1200), at(420 + TUNING.bodySpacing, 1200)), 'e', { meleeReadyAt: 0 });
    const cast = step(s0, [grapple('w', at(420, 100))], TICK_DT);
    expect(ofKind(cast.events, 'melee')).toMatchObject([{ attackerId: 'e', targetId: 'w' }]);
    const thrown = step(cast, [{ kind: 'hook', playerId: pid('w'), target: at(900, 1200) }], TICK_DT);
    expect(thrown.hooks).toEqual([]);
  });

  it('does not give way to a body in its path', () => {
    const s0 = duel(at(420, 1200), at(2300, 1250), [['w2', at(430, 1200)]]);
    const after = step(s0, [grapple('w', at(420, 100))], TICK_DT);
    expect(player(after, 'w').pos).toEqual(at(420, 1200));
    expect(Math.hypot(player(after, 'w2').pos.x - 420, player(after, 'w2').pos.y - 1200)).toBeCloseTo(TUNING.bodySpacing, 6);
  });

  it('an enemy hook latch ends the grapple and starts the cooldown', () => {
    const s0 = duel(at(900, 1200), at(1500, 1200));
    const cast = step(s0, [grapple('w', at(900, 40)), { kind: 'hook', playerId: pid('e'), target: at(900, 1200) }], TICK_DT);
    const hit = runUntil(cast, (s) => s.events.some((e) => e.kind === 'hookHit'), 60);
    expect(ofKind(hit.events, 'grappleLand')).toEqual([]);
    expect(hit.state.grapples).toEqual([]);
    expect(player(hit.state, 'w').status.kind).toBe('dragged');
    expect(player(hit.state, 'w').hp).toBe(TUNING.maxHp - TUNING.hookDamage);
    expect(readyAt(hit.state)).toBeCloseTo(hit.state.time - TICK_DT + ITEMS.grapple.cooldown, 9);
    expect(ofKind(run(hit.state, 120).events, 'grappleArrive')).toEqual([]);
  });

  it('an ally hook latch ends it too', () => {
    const s0 = duel(at(420, 1200), at(2300, 1250), [['w2', at(800, 1200)]]);
    const cast = step(s0, [grapple('w', at(420, 40)), { kind: 'hook', playerId: pid('w2'), target: at(420, 1200) }], TICK_DT);
    const hit = runUntil(cast, (s) => s.events.some((e) => e.kind === 'hookHit'), 60);
    expect(hit.state.grapples).toEqual([]);
    expect(player(hit.state, 'w')).toMatchObject({ hp: TUNING.maxHp, status: { kind: 'dragged' } });
  });

  it('dying ends the grapple', () => {
    const s0 = withPlayer(duel(at(420, 1200), at(420 + TUNING.bodySpacing, 1200)), 'w', { hp: 1 });
    const killed = step(s0, [grapple('w', at(420, 100))], TICK_DT);
    expect(player(killed, 'w').status.kind).toBe('dead');
    expect(killed.grapples).toEqual([]);
    expect(ofKind(run(killed, 120).events, 'grappleArrive')).toEqual([]);
  });

  it('is used right after buying it', () => {
    const s0 = withPlayer(duel(at(420, 1200), at(2300, 1250)), 'w', { items: { grapple: { kind: 'unowned' }, barb: { kind: 'unowned' } } });
    const after = step(s0, [{ kind: 'buy', playerId: pid('w'), purchase: { kind: 'item', id: 'grapple' } }, grapple('w', at(420, 100))], TICK_DT);
    expect(ofKind(after.events, 'grappleCast')).toHaveLength(1);
  });
});
