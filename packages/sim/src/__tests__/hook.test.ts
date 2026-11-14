import { describe, expect, it } from 'vitest';
import { step, TICK_DT, TUNING } from '../index';
import type { GameState, Vec2 } from '../index';
import { at, match, ofKind, pid, player, run, runUntil, withPlayer } from './helpers';

const r = TUNING.playerRadius;
const reach = TUNING.playerRadius + TUNING.hookRadius;

function arena(w: Vec2, e: Vec2, extra: readonly [string, Vec2][] = []): GameState {
  const roster = [['w', 'west'] as const, ['e', 'east'] as const, ...extra.map(([id]) => [id, 'west'] as const)];
  const placed = [['w', w] as const, ['e', e] as const, ...extra];
  return placed.reduce((s, [id, pos]) => withPlayer(s, id, { pos }), match(roster));
}

const hook = (id: string, target: Vec2) => [{ kind: 'hook', playerId: pid(id), target }] as const;
const noHooks = (s: GameState) => s.hooks.length === 0;

function insideWalkable(s: GameState, p: Vec2): boolean {
  const onWest = p.x >= r && p.x <= s.arena.canal.x0 - r;
  const onEast = p.x >= s.arena.canal.x1 + r && p.x <= s.arena.width - r;
  return (onWest || onEast) && p.y >= r && p.y <= s.arena.height - r;
}

describe('hook', () => {
  it('flies straight, retracts empty at max range, and starts the cooldown on return', () => {
    const s0 = arena(at(420, 335), at(1980, 1015));
    let s = step(s0, hook('w', at(520, 335)), TICK_DT);
    expect(ofKind(s.events, 'hookCast')).toEqual([{ kind: 'hookCast', hookId: s.hooks[0]?.id, ownerId: 'w' }]);
    expect(player(s, 'w').facing).toBe(0);

    let maxX = 0;
    let removedAt = -1;
    for (let i = 0; i < 200 && s.hooks.length > 0; i++) {
      const before = s;
      s = step(s, [], TICK_DT);
      const h = s.hooks[0];
      if (h) {
        expect(h.pos.y).toBe(335);
        maxX = Math.max(maxX, h.pos.x);
      } else {
        removedAt = before.time;
      }
    }
    expect(maxX).toBeCloseTo(420 + TUNING.hookRange, 6);
    expect(removedAt).toBeGreaterThan(0);
    expect(player(s, 'w').hookReadyAt).toBeCloseTo(removedAt + TUNING.hookCooldown, 9);

    const tooSoon = step(s, hook('w', at(520, 335)), TICK_DT);
    expect(tooSoon.hooks).toEqual([]);
    const ready = runUntil(s, (x) => x.time >= player(x, 'w').hookReadyAt, 100).state;
    expect(step(ready, hook('w', at(520, 335)), TICK_DT).hooks).toHaveLength(1);
  });

  it('records the retracting phase with no cargo once the range is spent', () => {
    const s = run(arena(at(420, 335), at(1980, 1015)), 40, hook('w', at(520, 335))).state;
    expect(s.hooks[0]?.phase).toEqual({ kind: 'retracting', cargo: null });
  });

  it('allows only one hook in flight per player, and ignores aiming at yourself', () => {
    const s0 = arena(at(420, 335), at(1980, 1015));
    expect(step(s0, hook('w', at(420, 335)), TICK_DT).hooks).toEqual([]);
    const first = step(s0, hook('w', at(520, 335)), TICK_DT);
    const second = step(first, hook('w', at(520, 600)), TICK_DT);
    expect(second.hooks).toHaveLength(1);
    expect(ofKind(second.events, 'hookCast')).toEqual([]);
  });

  it('hits an enemy across the canal, damages and drags them, then releases them on the owner dock', () => {
    const s0 = arena(at(420, 335), at(1600, 335));
    const hit = runUntil(step(s0, hook('w', at(1600, 335)), TICK_DT), (s) => player(s, 'e').status.kind === 'dragged', 60);
    const [event] = ofKind(hit.events, 'hookHit');
    expect(event).toMatchObject({ ownerId: 'w', targetId: 'e', damage: TUNING.hookDamage, ally: false });
    expect(event?.at.x).toBeCloseTo(1600 - reach, 6);
    expect(player(hit.state, 'e')).toMatchObject({ hp: TUNING.maxHp - TUNING.hookDamage, moveTarget: null });

    const back = runUntil(hit.state, noHooks, 120).state;
    const e = player(back, 'e');
    expect(e.status).toEqual({ kind: 'alive' });
    expect(e.pos.x).toBeLessThan(back.arena.canal.x0);
    expect(insideWalkable(back, e.pos)).toBe(true);
    const w = player(back, 'w');
    expect(Math.hypot(e.pos.x - w.pos.x, e.pos.y - w.pos.y)).toBeLessThanOrEqual(TUNING.playerRadius * 2 + 1e-6);
  });

  it('drags an ally without damage', () => {
    const s0 = arena(at(420, 335), at(1980, 1015), [['w2', at(800, 335)]]);
    const hit = runUntil(step(s0, hook('w', at(800, 335)), TICK_DT), (s) => s.events.some((e) => e.kind === 'hookHit'), 30);
    expect(ofKind(hit.events, 'hookHit')[0]).toMatchObject({ targetId: 'w2', damage: 0, ally: true });
    expect(player(hit.state, 'w2').hp).toBe(TUNING.maxHp);
    expect(player(hit.state, 'w2').status.kind).toBe('dragged');
    const back = runUntil(hit.state, noHooks, 60).state;
    expect(player(back, 'w2').status).toEqual({ kind: 'alive' });
    expect(player(back, 'w2').pos.x).toBeLessThan(800);
  });

  it('bounces off the top bound and mirrors the vertical direction', () => {
    const s0 = arena(at(420, 335), at(1980, 1015));
    const { state, events } = runUntil(step(s0, hook('w', at(520, 235)), TICK_DT), (s) => s.events.some((e) => e.kind === 'hookBounce'), 30);
    const [bounce] = ofKind(events, 'hookBounce');
    const top = TUNING.hookRadius;
    expect(bounce?.at.y).toBeCloseTo(top, 6);
    expect(bounce?.at.x).toBeCloseTo(420 + (335 - top), 6);
    const h = state.hooks[0];
    expect(h?.dir.x).toBeCloseTo(Math.SQRT1_2, 9);
    expect(h?.dir.y).toBeCloseTo(Math.SQRT1_2, 9);
    expect(h?.path[1]).toEqual(bounce?.at);
  });

  it('bounces off the buoy, mirroring the direction about the surface normal', () => {
    const s0 = arena(at(420, 600), at(1980, 1015));
    const { state, events } = runUntil(step(s0, hook('w', at(800, 600)), TICK_DT), (s) => s.events.some((e) => e.kind === 'hookBounce'), 40);
    const [bounce] = ofKind(events, 'hookBounce');
    const { pos: c, radius } = s0.arena.buoy;
    const contact = radius + TUNING.hookRadius;
    expect(bounce?.at.y).toBeCloseTo(600, 6);
    expect(bounce?.at.x).toBeCloseTo(c.x - Math.sqrt(contact ** 2 - (c.y - 600) ** 2), 6);
    const n = { x: ((bounce?.at.x ?? 0) - c.x) / contact, y: ((bounce?.at.y ?? 0) - c.y) / contact };
    const expected = { x: 1 - 2 * n.x * n.x, y: -2 * n.x * n.y };
    expect(state.hooks[0]?.dir.x).toBeCloseTo(expected.x, 9);
    expect(state.hooks[0]?.dir.y).toBeCloseTo(expected.y, 9);
  });

  it('does not tunnel past a player with a large dt', () => {
    const s0 = arena(at(420, 335), at(1450, 335));
    const { events } = run(s0, 8, hook('w', at(1450, 335)), 0.25);
    expect(ofKind(events, 'hookHit')).toHaveLength(1);
  });

  it('keeps retracting to the owner even if the owner walks away', () => {
    const s0 = arena(at(420, 335), at(1980, 1015));
    const thrown = step(s0, hook('w', at(520, 335)), TICK_DT);
    const walking = step(thrown, [{ kind: 'move', playerId: pid('w'), target: at(420, 1200) }], TICK_DT);
    const done = runUntil(walking, noHooks, 200).state;
    expect(player(done, 'w').pos.y).toBeGreaterThan(335);
  });
});
