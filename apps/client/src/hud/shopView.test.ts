import { describe, expect, it } from 'vitest';
import { ECONOMY, ITEMS, UPGRADES } from '@hookbrawl/sim';
import type { GameEvent, GrappleId, HookId, Player, Purchase } from '@hookbrawl/sim';
import { BOT, fakePlayer, fakeView, HUMAN } from '../game/fakeSim';
import { bountyEarned, describeOutcome, grappleView, resolvePurchases, shopSlots } from './shopView';

const DAMAGE: Purchase = { kind: 'upgrade', id: 'damage' };
const RANGE: Purchase = { kind: 'upgrade', id: 'range' };
const GRAPPLE: Purchase = { kind: 'item', id: 'grapple' };
const MAX_LEVEL = UPGRADES.damage.costs.length;
const owned = (readyAt: number): Player['items'] => ({ grapple: { kind: 'owned', readyAt }, barb: { kind: 'unowned' } });

describe('shopSlots', () => {
  it('lists the four upgrades then the grapple and the barb, numbered 1 to 6, priced by the sim', () => {
    const slots = shopSlots(fakePlayer({ id: HUMAN, gold: 0 }));
    expect(slots.map((s) => [s.digit, s.name])).toEqual([
      ['1', 'Damage'],
      ['2', 'Range'],
      ['3', 'Speed'],
      ['4', 'Size'],
      ['5', 'Grapple'],
      ['6', 'Barb'],
    ]);
    expect(slots[0]?.price).toBe(UPGRADES.damage.costs[0]);
    expect(slots[0]?.level).toEqual({ current: 0, max: MAX_LEVEL });
    expect(slots[4]?.price).toBe(ITEMS.grapple.cost);
    expect(slots[4]?.level).toBeNull();
    expect(slots[5]?.price).toBe(ITEMS.barb.cost);
    expect(slots[5]?.level).toBeNull();
  });

  it('marks each slot affordable, too expensive, maxed or owned', () => {
    const player = fakePlayer({
      id: HUMAN,
      gold: UPGRADES.range.costs[1]! - 1,
      upgrades: { damage: MAX_LEVEL, range: 1, speed: 0, size: 0 },
      items: owned(0),
    });
    const slots = shopSlots(player);
    expect(slots.map((s) => s.state)).toEqual(['maxed', 'expensive', 'affordable', 'affordable', 'owned', 'expensive']);
    expect(slots[0]?.price).toBeNull();
    expect(slots[1]?.price).toBe(UPGRADES.range.costs[1]);
    expect(slots[4]?.price).toBeNull();
  });
});

describe('grappleView', () => {
  const hook = {
    id: 'h' as HookId,
    ownerId: HUMAN,
    pos: { x: 0, y: 0 },
    dir: { x: 1, y: 0 },
    path: [],
    phase: { kind: 'extending' as const, remaining: 100 },
    stats: { damage: 1, range: 1, speed: 1, retractSpeed: 1, radius: 1, barbed: false },
  };

  it('is locked with its price and whether it is affordable until bought', () => {
    const rich = fakePlayer({ id: HUMAN, gold: ITEMS.grapple.cost });
    const poor = fakePlayer({ id: HUMAN, gold: ITEMS.grapple.cost - 1 });
    expect(grappleView(fakeView({ players: [rich] }), rich)).toEqual({ kind: 'locked', price: ITEMS.grapple.cost, affordable: true });
    expect(grappleView(fakeView({ players: [poor] }), poor)).toEqual({ kind: 'locked', price: ITEMS.grapple.cost, affordable: false });
  });

  it('counts down its cooldown as seconds and a fraction of the full cooldown', () => {
    const me = fakePlayer({ id: HUMAN, items: owned(14) });
    const view = grappleView(fakeView({ time: 10, players: [me] }), me);
    expect(view).toEqual({ kind: 'cooldown', seconds: 4, fraction: 4 / ITEMS.grapple.cooldown });
  });

  it('is busy while grappling, dead or with the hook out, and ready otherwise', () => {
    const ready = fakePlayer({ id: HUMAN, items: owned(0) });
    expect(grappleView(fakeView({ time: 5, players: [ready] }), ready)).toEqual({ kind: 'ready' });
    expect(grappleView(fakeView({ time: 5, players: [ready], hooks: [hook] }), ready)).toEqual({ kind: 'busy' });
    const dead = { ...ready, status: { kind: 'dead' as const, respawnAt: 9 } };
    expect(grappleView(fakeView({ time: 5, players: [dead] }), dead)).toEqual({ kind: 'busy' });
    const pulling = { ...ready, status: { kind: 'grappling' as const, grappleId: 'g0' as GrappleId } };
    expect(grappleView(fakeView({ time: 5, players: [pulling] }), pulling)).toEqual({ kind: 'busy' });
  });
});

describe('resolvePurchases', () => {
  const bought = (purchase: Purchase, cost: number): GameEvent => ({ kind: 'purchase', playerId: HUMAN, purchase, cost });

  it('confirms each press the sim granted and gives the reason for each it refused', () => {
    const me = fakePlayer({ id: HUMAN, gold: 0, upgrades: { damage: MAX_LEVEL, range: 0, speed: 0, size: 0 }, items: owned(0) });
    const state = fakeView({ players: [me], events: [bought(DAMAGE, UPGRADES.damage.costs[MAX_LEVEL - 1]!)] });
    expect(resolvePurchases([DAMAGE, DAMAGE, RANGE, GRAPPLE], state, HUMAN)).toEqual([
      { purchase: DAMAGE, outcome: 'bought' },
      { purchase: DAMAGE, outcome: 'maxed' },
      { purchase: RANGE, outcome: 'poor' },
      { purchase: GRAPPLE, outcome: 'owned' },
    ]);
  });

  it('ignores purchases made by someone else', () => {
    const state = fakeView({
      players: [fakePlayer({ id: HUMAN, gold: 0 }), fakePlayer({ id: BOT, team: 'east' })],
      events: [{ kind: 'purchase', playerId: BOT, purchase: RANGE, cost: UPGRADES.range.costs[0]! }],
    });
    expect(resolvePurchases([RANGE], state, HUMAN)).toEqual([{ purchase: RANGE, outcome: 'poor' }]);
  });
});

describe('bountyEarned', () => {
  const kill = (killerId: Player['id'], assistIds: readonly Player['id'][]): GameEvent => ({
    kind: 'kill',
    killerId,
    victimId: BOT,
    assistIds,
    at: { x: 0, y: 0 },
  });

  it('adds kill and assist gold for the local player, and nothing for passive income', () => {
    expect(bountyEarned(fakeView(), HUMAN)).toBe(0);
    expect(bountyEarned(fakeView({ events: [kill(HUMAN, [])] }), HUMAN)).toBe(ECONOMY.killGold);
    expect(bountyEarned(fakeView({ events: [kill(BOT, [HUMAN])] }), HUMAN)).toBe(ECONOMY.assistGold);
    expect(bountyEarned(fakeView({ events: [kill(BOT, [])] }), HUMAN)).toBe(0);
  });
});

describe('describeOutcome', () => {
  it('says what happened to a press in words a screen reader can read', () => {
    const me = fakePlayer({ id: HUMAN, gold: 0, upgrades: { damage: 2, range: 0, speed: 0, size: 0 } });
    const [damage, range] = shopSlots(me);
    expect(describeOutcome(damage!, 'bought')).toBe(`Bought Damage, now level 2 of ${MAX_LEVEL}.`);
    expect(describeOutcome(range!, 'poor')).toBe(`Not enough gold for Range: ${UPGRADES.range.costs[0]} needed.`);
    expect(describeOutcome(damage!, 'maxed')).toBe('Damage is already maxed.');
  });
});
