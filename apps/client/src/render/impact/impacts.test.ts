import type { GameEvent, HookId, PlayerId, Vec2 } from '@hookbrawl/sim';
import { describe, expect, it } from 'vitest';
import { CALM_IMPACTS, IMPACTS, contactPoint, impactsOf, type Fighter } from './impacts';

const me = 'me' as PlayerId;
const foe = 'foe' as PlayerId;
const other = 'other' as PlayerId;
const hookId = 'h1' as HookId;
const places: Readonly<Record<string, Vec2>> = { me: { x: 100, y: 200 }, foe: { x: 180, y: 200 }, other: { x: 100, y: 120 } };
const fighterOf = (id: PlayerId): Fighter | null => (places[id] === undefined ? null : { pos: places[id], team: id === me ? 'west' : 'east' });
const melee = (attackerId: PlayerId, targetId: PlayerId): GameEvent => ({ kind: 'melee', attackerId, targetId, damage: 110, at: places[targetId]! });
const hookHit = (damage: number): GameEvent => ({ kind: 'hookHit', hookId, ownerId: me, targetId: foe, damage, ally: damage === 0, at: places.foe! });

describe('impactsOf', () => {
  it('turns a melee blow into an impact that travels from the attacker to the victim', () => {
    const [impact] = impactsOf([melee(me, foe)], fighterOf, me, IMPACTS);
    expect(impact).toMatchObject({ kind: 'melee', attackerId: me, targetId: foe, damage: 110, from: places.me, at: places.foe, team: 'west', involvesLocal: true });
    expect(impact!.heading).toBeCloseTo(0);
    expect(impact!.spec).toBe(IMPACTS.melee);
  });

  it('gives each side of a simultaneous trade its own impact, pointing opposite ways', () => {
    const [mine, theirs] = impactsOf([melee(me, foe), melee(foe, me)], fighterOf, me, IMPACTS);
    expect(mine!.heading).toBeCloseTo(0);
    expect(Math.abs(theirs!.heading)).toBeCloseTo(Math.PI);
  });

  it('treats a damaging hook as an impact and a harmless one on an ally as none', () => {
    expect(impactsOf([hookHit(350)], fighterOf, me, IMPACTS)).toMatchObject([{ kind: 'hook', attackerId: me, targetId: foe, damage: 350 }]);
    expect(impactsOf([hookHit(0)], fighterOf, me, IMPACTS)).toEqual([]);
  });

  it('knows whether the local player is in the exchange', () => {
    expect(impactsOf([melee(foe, other)], fighterOf, me, IMPACTS)[0]!.involvesLocal).toBe(false);
    expect(impactsOf([melee(foe, me)], fighterOf, me, IMPACTS)[0]!.involvesLocal).toBe(true);
  });

  it('ignores events that are not blows', () => {
    const events: readonly GameEvent[] = [
      { kind: 'hookCast', hookId, ownerId: me },
      { kind: 'hookBounce', hookId, at: places.foe! },
      { kind: 'kill', killerId: me, victimId: foe, assistIds: [], at: places.foe! },
      { kind: 'respawn', playerId: foe },
      { kind: 'matchEnd', winner: 'west' },
    ];
    expect(impactsOf(events, fighterOf, me, IMPACTS)).toEqual([]);
  });

  it('falls back to where the event says the blow landed when the attacker is gone', () => {
    const [impact] = impactsOf([melee('ghost' as PlayerId, foe)], fighterOf, me, IMPACTS);
    expect(impact).toMatchObject({ from: places.foe, at: places.foe, heading: 0, team: null });
  });
});

describe('contactPoint', () => {
  it('lies on the attacker\'s side of the victim', () => {
    const [impact] = impactsOf([melee(me, foe)], fighterOf, me, IMPACTS);
    const contact = contactPoint(impact!, 20);
    expect(contact).toEqual({ x: 160, y: 200 });
  });
});

describe('the calm table, for people who ask for less motion', () => {
  it('drops the freeze and the camera shake and keeps everything else', () => {
    (Object.keys(IMPACTS) as (keyof typeof IMPACTS)[]).forEach((kind) => {
      expect(CALM_IMPACTS[kind]).toEqual({ ...IMPACTS[kind], hitStop: 0, shake: 0 });
    });
  });

  it('shakes less for a melee blow than for a hook', () => {
    expect(IMPACTS.melee.shake).toBeGreaterThan(0);
    expect(IMPACTS.melee.shake).toBeLessThan(IMPACTS.hook.shake);
  });
});
