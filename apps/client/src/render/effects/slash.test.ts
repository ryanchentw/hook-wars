import type { GameEvent, HookId, PlayerId } from '@hookwars/sim';
import { describe, expect, it } from 'vitest';
import { IMPACTS, impactsOf, type Fighter } from '../impact/impacts';
import { SLASH } from '../theme';
import { slashGlow, slashTurn, slashesFrom, stepSlashes } from './slash';

const a = 'a' as PlayerId;
const b = 'b' as PlayerId;
const fighterOf = (id: PlayerId): Fighter => (id === a ? { pos: { x: 0, y: 0 }, team: 'west' } : { pos: { x: 80, y: 0 }, team: 'east' });
const swing: GameEvent = { kind: 'melee', attackerId: a, targetId: b, damage: 110, at: { x: 80, y: 0 } };
const hook: GameEvent = { kind: 'hookHit', hookId: 'h' as HookId, ownerId: a, targetId: b, damage: 350, ally: false, at: { x: 80, y: 0 } };
const impacts = (events: readonly GameEvent[]) => impactsOf(events, fighterOf, a, IMPACTS);

describe('slash arcs', () => {
  it('draws one for a melee blow, centred on the attacker and in their colour, and none for a thrown hook', () => {
    expect(slashesFrom(impacts([swing]))).toMatchObject([{ origin: { x: 0, y: 0 }, heading: 0, team: 'west', age: 0 }]);
    expect(slashesFrom(impacts([hook]))).toEqual([]);
  });

  it('holds still and at full glow through the hit-stop, then sweeps on and dies away', () => {
    const [slash] = slashesFrom(impacts([swing]));
    const hold = slash!.hold;
    expect(hold).toBe(IMPACTS.melee.hitStop);
    expect(slashGlow(0, hold)).toBe(1);
    expect(slashTurn(0, hold)).toBe(0);
    expect(slashTurn(hold, hold)).toBe(0);
    expect(slashTurn(hold + SLASH.life / 2, hold)).toBeGreaterThan(0);
    expect(slashGlow(hold + SLASH.life / 2, hold)).toBeLessThan(1);
    expect(slashGlow(hold + SLASH.life, hold)).toBe(0);
    expect(slashTurn(hold + SLASH.life, hold)).toBeCloseTo(SLASH.sweepDeg * (Math.PI / 180));
  });

  it('only ever sweeps one way', () => {
    const turns = Array.from({ length: 40 }, (_, i) => slashTurn(i * 0.01, 0.075));
    turns.slice(1).forEach((turn, i) => expect(turn).toBeGreaterThanOrEqual(turns[i]!));
  });

  it('is gone well before the same brawler swings again, and leaves its input alone', () => {
    const born = slashesFrom(impacts([swing]));
    const later = stepSlashes(born, 0.1);
    expect(later).toMatchObject([{ age: 0.1 }]);
    expect(born[0]!.age).toBe(0);
    expect(stepSlashes(born, 0.45)).toEqual([]);
  });
});
