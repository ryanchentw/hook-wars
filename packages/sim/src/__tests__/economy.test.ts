import { describe, expect, it } from 'vitest';
import { ECONOMY, step, TICK_DT, TUNING } from '../index';
import type { GameState, Vec2 } from '../index';
import { at, match, ofKind, pid, player, run, withPlayer } from './helpers';

const FAR: Readonly<Record<string, Vec2>> = {
  w1: at(100, 100),
  w2: at(100, 1250),
  w3: at(300, 100),
  e: at(2300, 1250),
  e2: at(2300, 100),
};

function squad(): GameState {
  const s = match([
    ['w1', 'west'],
    ['w2', 'west'],
    ['w3', 'west'],
    ['e', 'east'],
    ['e2', 'east'],
  ]);
  return Object.entries(FAR).reduce((acc, [id, pos]) => withPlayer(acc, id, { pos }), s);
}

/** Puts `attacker` next to `victim` on the west dock and everyone else far away. */
function faceOff(s: GameState, attacker: string, victim: string): GameState {
  const apart = Object.entries(FAR).reduce((acc, [id, pos]) => withPlayer(acc, id, { pos }), s);
  return withPlayer(withPlayer(apart, victim, { pos: at(600, 600) }), attacker, { pos: at(600 + TUNING.bodySpacing, 600) });
}

/** One melee exchange between `attacker` and `victim`, then everyone parted again. */
function strike(s: GameState, attacker: string, victim: string): GameState {
  const ready = withPlayer(s, attacker, { meleeReadyAt: 0 });
  const hit = step(faceOff(ready, attacker, victim), [], TICK_DT);
  expect(ofKind(hit.events, 'melee')).toContainEqual(expect.objectContaining({ attackerId: attacker, targetId: victim }));
  return Object.entries(FAR).reduce((acc, [id, pos]) => withPlayer(acc, id, { pos }), hit);
}

function finish(s: GameState, killer: string, victim: string): GameState {
  const doomed = withPlayer(withPlayer(s, victim, { hp: 1, meleeReadyAt: 99 }), killer, { meleeReadyAt: 0 });
  return step(faceOff(doomed, killer, victim), [], TICK_DT);
}

describe('passive income', () => {
  it('pays 5 gold to every player at each whole second, dead or alive', () => {
    const s = withPlayer(squad(), 'e', { status: { kind: 'dead', respawnAt: 99 } });
    expect(run(s, 29).state.players.map((p) => p.gold)).toEqual([150, 150, 150, 150, 150]);
    const second = run(s, 30).state;
    expect(second.players.map((p) => p.gold)).toEqual([155, 155, 155, 155, 155]);
    expect(player(run(s, 90).state, 'e').gold).toBe(150 + 3 * ECONOMY.passiveGold);
  });

  it('pays every second crossed by a long step', () => {
    expect(player(step(squad(), [], 2.5), 'w1').gold).toBe(160);
  });
});

describe('damage log', () => {
  it('records the latest enemy damage and forgets it after the assist window', () => {
    const hit = strike(squad(), 'w1', 'e');
    expect(player(hit, 'e').recentDamage).toEqual([{ from: 'w1', at: 0 }]);
    const later = run(hit, Math.ceil(ECONOMY.assistWindow / TICK_DT) + 2).state;
    expect(player(later, 'e').recentDamage).toEqual([]);
  });

  it('an ally pull does no damage and leaves no record', () => {
    const s = withPlayer(withPlayer(squad(), 'e', { pos: at(1600, 600) }), 'e2', { pos: at(2200, 600) });
    const thrown = step(s, [{ kind: 'hook', playerId: pid('e2'), target: at(1600, 600) }], TICK_DT);
    const { events, state } = run(thrown, 20);
    expect(ofKind(events, 'hookHit')).toMatchObject([{ targetId: 'e', ally: true }]);
    expect(player(state, 'e').recentDamage).toEqual([]);
  });

  it('is emptied when the player dies', () => {
    const killed = finish(strike(squad(), 'w1', 'e'), 'w2', 'e');
    expect(player(killed, 'e').recentDamage).toEqual([]);
  });
});

describe('kill bounty', () => {
  it('pays the killer, and every other enemy who damaged the victim in the window gets an assist', () => {
    const softened = strike(strike(squad(), 'w1', 'e'), 'w3', 'e');
    const killed = finish(softened, 'w2', 'e');
    const [kill] = ofKind(killed.events, 'kill');
    expect(kill).toMatchObject({ killerId: 'w2', victimId: 'e' });
    expect([...(kill?.assistIds ?? [])].sort()).toEqual(['w1', 'w3']);
    expect(player(killed, 'w2')).toMatchObject({ gold: 150 + ECONOMY.killGold, assists: 0, kills: 1 });
    expect(player(killed, 'w1')).toMatchObject({ gold: 150 + ECONOMY.assistGold, assists: 1, kills: 0 });
    expect(player(killed, 'w3')).toMatchObject({ gold: 150 + ECONOMY.assistGold, assists: 1 });
    expect(player(killed, 'e2')).toMatchObject({ gold: 150, assists: 0 });
  });

  it('gives the killer no assist for their own earlier damage', () => {
    const killed = finish(strike(squad(), 'w1', 'e'), 'w1', 'e');
    expect(ofKind(killed.events, 'kill')[0]?.assistIds).toEqual([]);
    expect(player(killed, 'w1')).toMatchObject({ gold: 150 + ECONOMY.killGold, assists: 0 });
  });

  it('gives no assist once the window has passed', () => {
    const stale = run(strike(squad(), 'w1', 'e'), Math.ceil(ECONOMY.assistWindow / TICK_DT) + 2).state;
    const killed = finish(stale, 'w2', 'e');
    expect(ofKind(killed.events, 'kill')[0]?.assistIds).toEqual([]);
    expect(player(killed, 'w1').assists).toBe(0);
  });

  it('a hook hit counts toward an assist', () => {
    const s = withPlayer(withPlayer(squad(), 'w1', { pos: at(420, 335) }), 'e', { pos: at(1600, 335) });
    const thrown = step(s, [{ kind: 'hook', playerId: pid('w1'), target: at(1600, 335) }], TICK_DT);
    const dropped = run(thrown, 90).state;
    expect(dropped.hooks).toEqual([]);
    expect(player(dropped, 'e').recentDamage.map((d) => d.from)).toEqual(['w1']);
    const killed = finish(dropped, 'w2', 'e');
    expect(ofKind(killed.events, 'kill')[0]?.assistIds).toEqual(['w1']);
  });
});
