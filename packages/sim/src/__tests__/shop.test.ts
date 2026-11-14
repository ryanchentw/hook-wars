import { describe, expect, it } from 'vitest';
import { canBuy, createMatch, hookStats, priceOf, step, TICK_DT, TUNING } from '../index';
import type { Player, Purchase } from '../index';
import { at, buy, match, ofKind, pid, player, run, runUntil, withPlayer } from './helpers';

const duel = () =>
  match([
    ['w', 'west'],
    ['e', 'east'],
  ]);

const damage: Purchase = { kind: 'upgrade', id: 'damage' };
const grappleItem: Purchase = { kind: 'item', id: 'grapple' };

function leveled(p: Player, upgrades: Partial<Player['upgrades']>): Player {
  return { ...p, upgrades: { ...p.upgrades, ...upgrades } };
}

describe('starting kit', () => {
  it('every player starts with 150 gold, no upgrades and no grapple', () => {
    expect(player(duel(), 'w')).toMatchObject({
      gold: 150,
      assists: 0,
      upgrades: { damage: 0, range: 0, speed: 0, size: 0 },
      items: { grapple: { kind: 'unowned' } },
      recentDamage: [],
    });
  });

  it('the match config can set the starting gold', () => {
    const s = createMatch({
      killTarget: 5,
      startingGold: 1000,
      players: [
        { id: pid('w'), name: 'w', team: 'west', isBot: false },
        { id: pid('e'), name: 'e', team: 'east', isBot: false },
      ],
    });
    expect(s.players.map((p) => p.gold)).toEqual([1000, 1000]);
  });
});

describe('prices', () => {
  it('each upgrade level costs 200, 350, 500, 700, then is maxed', () => {
    const base = player(duel(), 'w');
    const prices = [0, 1, 2, 3, 4].map((level) => priceOf(leveled(base, { damage: level }), damage));
    expect(prices).toEqual([200, 350, 500, 700, null]);
  });

  it('the grapple costs 150 once, and has no price once owned', () => {
    const base = player(duel(), 'w');
    expect(priceOf(base, grappleItem)).toBe(150);
    expect(priceOf({ ...base, items: { grapple: { kind: 'owned', readyAt: 0 } } }, grappleItem)).toBeNull();
  });

  it('canBuy needs a price and enough gold', () => {
    const base = player(duel(), 'w');
    expect(canBuy({ ...base, gold: 199 }, damage)).toBe(false);
    expect(canBuy({ ...base, gold: 200 }, damage)).toBe(true);
    expect(canBuy({ ...leveled(base, { damage: 4 }), gold: 9999 }, damage)).toBe(false);
  });
});

describe('hookStats', () => {
  it('with no upgrades is the base hook', () => {
    expect(hookStats(player(duel(), 'w'))).toEqual({
      damage: TUNING.hookDamage,
      range: TUNING.hookRange,
      speed: TUNING.hookSpeed,
      retractSpeed: TUNING.hookRetractSpeed,
      radius: TUNING.hookRadius,
    });
  });

  it('each level adds 75 damage, 150 range, 150 speed and retract speed, 5 radius', () => {
    const p = leveled(player(duel(), 'w'), { damage: 2, range: 1, speed: 3, size: 4 });
    expect(hookStats(p)).toEqual({
      damage: TUNING.hookDamage + 150,
      range: TUNING.hookRange + 150,
      speed: TUNING.hookSpeed + 450,
      retractSpeed: TUNING.hookRetractSpeed + 450,
      radius: TUNING.hookRadius + 20,
    });
  });
});

describe('buying', () => {
  it('deducts the price, raises the level and emits a purchase', () => {
    const s = withPlayer(duel(), 'w', { gold: 250 });
    const after = step(s, [buy('w', damage)], TICK_DT);
    expect(player(after, 'w')).toMatchObject({ gold: 50, upgrades: { damage: 1, range: 0, speed: 0, size: 0 } });
    expect(ofKind(after.events, 'purchase')).toEqual([{ kind: 'purchase', playerId: 'w', purchase: damage, cost: 200 }]);
  });

  it('buys the grapple ready to use', () => {
    const after = step(duel(), [buy('w', grappleItem)], TICK_DT);
    expect(player(after, 'w').gold).toBe(0);
    const item = player(after, 'w').items.grapple;
    expect(item.kind === 'owned' && item.readyAt <= after.time).toBe(true);
  });

  it('works while dead', () => {
    const s = withPlayer(duel(), 'w', { gold: 200, status: { kind: 'dead', respawnAt: 3 } });
    expect(player(step(s, [buy('w', damage)], TICK_DT), 'w').upgrades.damage).toBe(1);
  });

  it('ignores a purchase the player cannot afford, a maxed upgrade and an owned item', () => {
    const poor = withPlayer(duel(), 'w', { gold: 199 });
    const maxed = withPlayer(duel(), 'w', { gold: 5000, upgrades: { damage: 4, range: 0, speed: 0, size: 0 } });
    const owned = withPlayer(duel(), 'w', { gold: 5000, items: { grapple: { kind: 'owned', readyAt: 0 } } });
    [
      [poor, damage],
      [maxed, damage],
      [owned, grappleItem],
    ].forEach(([s, purchase]) => {
      const state = s as typeof poor;
      const after = step(state, [buy('w', purchase as Purchase)], TICK_DT);
      expect(ofKind(after.events, 'purchase')).toEqual([]);
      expect(player(after, 'w')).toMatchObject({
        gold: player(state, 'w').gold,
        upgrades: player(state, 'w').upgrades,
        items: player(state, 'w').items,
      });
    });
  });

  it('spends gold across several purchases in one step until it runs out', () => {
    const s = withPlayer(duel(), 'w', { gold: 600 });
    const after = step(s, [buy('w', damage), buy('w', damage), buy('w', damage)], TICK_DT);
    expect(player(after, 'w')).toMatchObject({ gold: 50, upgrades: { damage: 2 } });
  });

  it('respawning keeps gold, upgrades and items', () => {
    const kit = { gold: 777, upgrades: { damage: 2, range: 1, speed: 0, size: 3 }, items: { grapple: { kind: 'owned', readyAt: 0 } } } as const;
    const doomed = withPlayer(withPlayer(duel(), 'e', { ...kit, pos: at(950, 335), hp: 1 }), 'w', { pos: at(880, 335) });
    const back = runUntil(doomed, (s) => s.events.some((e) => e.kind === 'respawn'), 200).state;
    expect(player(back, 'e')).toMatchObject({ upgrades: kit.upgrades, items: kit.items });
    expect(player(back, 'e').gold).toBeGreaterThanOrEqual(kit.gold);
  });
});

describe('hook stats in play', () => {
  const lane = () => withPlayer(withPlayer(duel(), 'w', { pos: at(420, 335) }), 'e', { pos: at(1600, 335) });
  const hookAt = (target = at(1600, 335)) => [{ kind: 'hook', playerId: pid('w'), target }] as const;
  const firstHit = (s: ReturnType<typeof lane>) =>
    ofKind(runUntil(step(s, hookAt(), TICK_DT), (x) => x.events.some((e) => e.kind === 'hookHit'), 60).events, 'hookHit')[0];

  it('a damage upgrade hits harder', () => {
    const s = withPlayer(lane(), 'w', { upgrades: { damage: 1, range: 0, speed: 0, size: 0 } });
    expect(firstHit(s)?.damage).toBe(TUNING.hookDamage + 75);
  });

  it('a range upgrade flies further', () => {
    const s = withPlayer(lane(), 'w', { upgrades: { damage: 0, range: 2, speed: 0, size: 0 } });
    const away = withPlayer(s, 'e', { pos: at(2300, 1300) });
    let cur = step(away, hookAt(at(2000, 335)), TICK_DT);
    let maxX = 0;
    while (cur.hooks.length > 0) {
      maxX = Math.max(maxX, cur.hooks[0]?.pos.x ?? 0);
      cur = step(cur, [], TICK_DT);
    }
    expect(maxX).toBeCloseTo(420 + TUNING.hookRange + 300, 6);
  });

  it('a speed upgrade flies faster', () => {
    const s = withPlayer(lane(), 'w', { upgrades: { damage: 0, range: 0, speed: 1, size: 0 } });
    expect(step(s, hookAt(), TICK_DT).hooks[0]?.pos.x).toBeCloseTo(420 + (TUNING.hookSpeed + 150) * TICK_DT, 9);
  });

  it('a size upgrade hits a target the base hook would graze past', () => {
    const miss = TUNING.playerRadius + TUNING.hookRadius + 3;
    const offset = withPlayer(lane(), 'e', { pos: at(1600, 335 + miss) });
    const hits = (s: ReturnType<typeof lane>) => ofKind(run(s, 60, hookAt()).events, 'hookHit').length;
    expect(hits(offset)).toBe(0);
    expect(hits(withPlayer(offset, 'w', { upgrades: { damage: 0, range: 0, speed: 0, size: 1 } }))).toBe(1);
  });

  it('a purchase while the hook is in the air does not change that hook', () => {
    const s = withPlayer(lane(), 'w', { gold: 200 });
    const thrown = step(step(s, hookAt(), TICK_DT), [buy('w', damage)], TICK_DT);
    expect(player(thrown, 'w').upgrades.damage).toBe(1);
    const hit = ofKind(runUntil(thrown, (x) => x.events.some((e) => e.kind === 'hookHit'), 60).events, 'hookHit')[0];
    expect(hit?.damage).toBe(TUNING.hookDamage);
  });
});
