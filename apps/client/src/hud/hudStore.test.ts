import { describe, expect, it } from 'vitest';
import { ECONOMY, TICK_DT } from '@hookbrawl/sim';
import type { GameEvent, MatchConfig, PlayerInput, Purchase } from '@hookbrawl/sim';
import { BOT, createFakeSim, HUMAN } from '../game/fakeSim';
import { createSession, type SimApi } from '../game/session';
import { createHudStore } from './hudStore';

const config: MatchConfig = {
  killTarget: 10,
  players: [
    { id: HUMAN, name: 'You', team: 'west', isBot: false },
    { id: BOT, name: 'Bot', team: 'east', isBot: true },
  ],
};
const DAMAGE: Purchase = { kind: 'upgrade', id: 'damage' };
const SIZE: Purchase = { kind: 'upgrade', id: 'size' };

/** Grants every damage purchase and nothing else, and lets a test script extra events into the next tick. */
function setup() {
  const fake = createFakeSim();
  const extra: GameEvent[] = [];
  const sent: PlayerInput[] = [];
  const sim: SimApi = {
    ...fake,
    step: (state, inputs, dt) => {
      sent.push(...inputs);
      const granted = inputs.flatMap((i): GameEvent[] =>
        i.kind === 'buy' && i.purchase.id === 'damage' ? [{ kind: 'purchase', playerId: i.playerId, purchase: i.purchase, cost: 1 }] : [],
      );
      return { ...fake.step(state, inputs, dt), events: [...granted, ...extra.splice(0)] };
    },
  };
  const session = createSession(sim, { config, localPlayerId: HUMAN, botSeed: 1 });
  return { session, store: createHudStore(session), extra, sent, tick: () => session.advance(TICK_DT) };
}

describe('hud store purchases', () => {
  it('sends each buy for the local player and flashes its slot with the outcome once the sim answers', () => {
    const { store, sent, tick } = setup();
    store.buy(DAMAGE);
    store.buy(SIZE);
    expect(store.getSnapshot().feedback.slots).toEqual({});
    tick();
    expect(sent.filter((i) => i.kind === 'buy')).toEqual([
      { kind: 'buy', playerId: HUMAN, purchase: DAMAGE },
      { kind: 'buy', playerId: HUMAN, purchase: SIZE },
    ]);
    const { slots, announcement } = store.getSnapshot().feedback;
    expect(slots.damage?.outcome).toBe('bought');
    expect(slots.size?.outcome).toBe('poor');
    expect(announcement).toMatch(/^Not enough gold for Size/);
  });

  it('gives a repeated press a fresh flash', () => {
    const { store, tick } = setup();
    store.buy(DAMAGE);
    tick();
    const first = store.getSnapshot().feedback.slots.damage?.seq;
    store.buy(DAMAGE);
    tick();
    expect(store.getSnapshot().feedback.slots.damage?.seq).not.toBe(first);
  });

  it('forgets presses and flashes when the match restarts', () => {
    const { store, tick } = setup();
    store.buy(SIZE);
    tick();
    store.buy(SIZE);
    store.playAgain();
    tick();
    expect(store.getSnapshot().feedback.slots).toEqual({});
  });
});

describe('hud store bounty', () => {
  it('flashes the purse for kill gold and leaves it alone otherwise', () => {
    const { store, extra, tick } = setup();
    tick();
    expect(store.getSnapshot().feedback.bounty).toBeNull();
    extra.push({ kind: 'kill', killerId: HUMAN, victimId: BOT, assistIds: [], at: { x: 0, y: 0 } });
    tick();
    expect(store.getSnapshot().feedback.bounty?.amount).toBe(ECONOMY.killGold);
    const seq = store.getSnapshot().feedback.bounty?.seq;
    tick();
    expect(store.getSnapshot().feedback.bounty?.seq).toBe(seq);
  });
});
