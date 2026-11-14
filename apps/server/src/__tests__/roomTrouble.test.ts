import type { PlayerId } from '@hookbrawl/sim';
import { describe, expect, it } from 'vitest';
import { harness, RULES, started, TICK_MS } from './roomHarness';

const WEST = 'west-0' as PlayerId;
const EAST = 'east-0' as PlayerId;
const SAVINGS = { kind: 'upgrade', id: 'damage' } as const;

const fighter = (h: ReturnType<typeof harness>, id: PlayerId) => h.room.match!.state.players.find((p) => p.id === id)!;

describe('dropping out of a match', () => {
  it('hands the fighter to a bot that fights but spends nothing', () => {
    const { h, east } = started();
    const before = fighter(h, EAST);
    h.disconnect(east);
    h.run(50_000);
    const after = fighter(h, EAST);
    expect(after.pos).not.toEqual(before.pos);
    expect(after.upgrades).toEqual(before.upgrades);
    expect(after.items).toEqual(before.items);
    expect(after.gold).toBeGreaterThanOrEqual(before.gold + 5 * 49);
  });

  it('tells both teams the dropped fighter is a bot, and that it is not once its member takes it back', () => {
    const { h, west, east } = started();
    const shownAsBot = () => h.last(west, 'snap').view.roster.find((p) => p.id === EAST)!.isBot;
    h.run(TICK_MS * 4);
    expect(shownAsBot()).toBe(false);
    h.disconnect(east);
    h.run(1000);
    expect(shownAsBot()).toBe(true);
    h.rejoin(h.tokenOf(east));
    h.run(1000);
    expect(shownAsBot()).toBe(false);
    expect(h.last(east, 'snap').view.players.find((p) => p.id === EAST)!.isBot).toBe(false);
  });

  it('stops sending to the dropped member and keeps sending to the rest', () => {
    const { h, west, east } = started();
    h.disconnect(east);
    h.forget();
    h.run(1000);
    expect(h.sentTo(east, 'snap')).toEqual([]);
    expect(h.sentTo(west, 'snap')).toHaveLength(20);
  });

  it('gives the seat, the fighter, the gold and the items back inside the window', () => {
    const { h, east } = started();
    h.input(east, { seq: 1, steer: { x: 0, y: 0 }, acts: [{ kind: 'buy', purchase: { kind: 'item', id: 'grapple' } }] });
    h.run(TICK_MS * 2);
    h.disconnect(east);
    h.run(RULES.rejoinWindowMs - 5000);
    const gold = fighter(h, EAST).gold;
    const back = h.rejoin(h.tokenOf(east));
    expect(back).toMatchObject({ ok: true, member: east });
    const resume = h.last(east, 'welcome').match!;
    expect(resume).toMatchObject({ you: EAST, resumed: true, startsInMs: 0, matchId: 1 });
    const me = resume.view.players.find((p) => p.id === EAST)!;
    expect(me.gold).toBe(gold);
    expect(me.items.grapple.kind).toBe('owned');
  });

  it('takes the fighter back from the bot standing still, and listens to the new connection from its first input', () => {
    const { h, east } = started();
    for (let seq = 1; seq <= 5; seq += 1) h.input(east, { seq, steer: { x: 0, y: 1 }, acts: [] });
    h.run(TICK_MS * 6);
    h.disconnect(east);
    h.run(5000);
    h.rejoin(h.tokenOf(east));
    h.run(TICK_MS);
    expect(fighter(h, EAST).move.kind).toBe('idle');
    h.input(east, { seq: 1, steer: { x: 0, y: 0 }, acts: [{ kind: 'buy', purchase: SAVINGS }] });
    h.run(TICK_MS * 2);
    expect(h.last(east, 'snap').ack).toBe(1);
  });

  it('frees the seat after the window and leaves the fighter to a bot for the rest of the match', () => {
    const { h, west, east } = started();
    h.disconnect(east);
    h.run(RULES.rejoinWindowMs + 1000);
    expect(h.rejoin(h.tokenOf(east))).toEqual({ ok: false, code: 'rejoin-refused' });
    expect(h.last(west, 'room').lobby.room.slots.east[0]).toEqual({ kind: 'empty' });
    expect(h.room.match?.fighters.find((f) => f.id === EAST)?.owner).toBeNull();
    const before = fighter(h, EAST).pos;
    h.run(5000);
    expect(fighter(h, EAST).pos).not.toEqual(before);
  });

  it('makes a fighter a bot at once when its member leaves for good', () => {
    const { h, west } = started();
    h.leave(west);
    expect(h.room.match?.fighters.find((f) => f.id === WEST)?.owner).toBeNull();
    expect(h.room.lobby.slots.west[0]).toEqual({ kind: 'empty' });
  });
});

describe('after the match', () => {
  it('returns everyone to the same lobby and lets the host start the next', () => {
    const h = harness();
    const [ada, bo] = [h.join('Ada'), h.join('Bo')];
    h.act(ada, { kind: 'fillWithBots' });
    h.act(ada, { kind: 'setKillTarget', killTarget: 5 });
    const seats = h.room.lobby.slots;
    h.act(ada, { kind: 'startMatch' });
    h.disconnect(ada);
    h.disconnect(bo);
    for (let minute = 0; minute < 20 && h.room.match !== null; minute += 1) {
      h.run(50_000);
      h.rejoin(h.tokenOf(ada));
      h.rejoin(h.tokenOf(bo));
      h.disconnect(ada);
      h.disconnect(bo);
    }
    h.rejoin(h.tokenOf(ada));
    h.rejoin(h.tokenOf(bo));
    expect(h.room.match).toBeNull();
    expect(h.last(bo, 'room').lobby.room).toMatchObject({ phase: { kind: 'lobby' }, slots: seats, matchesStarted: 1 });
    h.act(h.room.lobby.host!, { kind: 'startMatch' });
    expect(h.last(bo, 'matchStart').match.matchId).toBe(2);
  });

  it('ends on a last snapshot that says who won', () => {
    const h = harness();
    const ada = h.join('Ada');
    h.act(ada, { kind: 'fillWithBots' });
    h.act(ada, { kind: 'setKillTarget', killTarget: 5 });
    h.act(ada, { kind: 'startMatch' });
    for (let minute = 0; minute < 30 && h.room.match !== null; minute += 1) h.run(60_000);
    const final = h.last(ada, 'snap').view;
    expect(final.phase.kind).toBe('ended');
    expect(Math.max(final.score.west, final.score.east)).toBe(5);
  });
});
