import { visibleTo, type PlayerId } from '@hookwars/sim';
import { describe, expect, it } from 'vitest';
import { takeInputs } from '../rooms/inputQueue';
import { duel, harness, RULES, started, TICK_MS } from './roomHarness';

const WEST = 'west-0' as PlayerId;
const EAST = 'east-0' as PlayerId;
const EAST_STEER = { x: 1, y: 0 };
const STILL = { x: 0, y: 0 };

describe('starting', () => {
  it('tells each member which fighter is theirs and shows them their own side', () => {
    const { h, west, east } = duel();
    h.act(west, { kind: 'startMatch' });
    expect(h.last(west, 'matchStart').match).toMatchObject({ matchId: 1, you: WEST, startsInMs: RULES.countdownMs, resumed: false, view: { viewer: 'west', tick: 0 } });
    expect(h.last(east, 'matchStart').match).toMatchObject({ you: EAST, view: { viewer: 'east' } });
    expect(h.last(east, 'room').lobby.room.phase.kind).toBe('in-match');
  });

  it('holds the first tick until the countdown has run', () => {
    const { h, west } = duel();
    h.act(west, { kind: 'startMatch' });
    h.run(RULES.countdownMs - 1);
    expect(h.sentTo(west, 'snap')).toEqual([]);
    h.run(TICK_MS + 2);
    expect(h.room.match?.ticksRun).toBe(1);
  });
});

describe('the tick', () => {
  it('runs thirty to the second however unevenly it is woken, and sends about twenty snapshots', () => {
    const { h, west } = started();
    h.forget();
    h.run(3000, 37);
    expect(h.room.match?.ticksRun).toBe(90);
    expect(h.sentTo(west, 'snap')).toHaveLength(60);
    expect(h.last(west, 'snap').view.tick).toBe(90);
  });

  it('runs a few ticks after a stall and drops the rest, without falling behind for good', () => {
    const { h } = started();
    h.stall(2000);
    expect(h.room.match?.ticksRun).toBe(RULES.maxCatchUpTicks);
    h.run(1000);
    expect(h.room.match?.ticksRun).toBe(RULES.maxCatchUpTicks + 30);
  });
});

describe('inputs', () => {
  it('walks the fighter one stride per input and acknowledges each', () => {
    const { h, west } = started();
    const from = h.last(west, 'matchStart').match.view.players.find((p) => p.id === WEST)!.pos.x;
    for (let seq = 1; seq <= 6; seq += 1) {
      h.input(west, { seq, steer: EAST_STEER, acts: [] });
      h.run(TICK_MS);
    }
    h.input(west, { seq: 7, steer: STILL, acts: [] });
    h.run(TICK_MS * 2);
    const snap = h.last(west, 'snap');
    expect(snap.ack).toBe(7);
    expect(snap.view.players.find((p) => p.id === WEST)!.pos.x).toBeCloseTo(from + 6 * 10, 5);
  });

  it('ignores inputs sent before the first tick, replays, and inputs from someone with no fighter', () => {
    const { h, west } = duel();
    const late = h.join('Cy');
    h.act(west, { kind: 'startMatch' });
    h.input(west, { seq: 1, steer: EAST_STEER, acts: [] });
    h.run(RULES.countdownMs);
    h.input(late, { seq: 1, steer: EAST_STEER, acts: [] });
    h.input(west, { seq: 5, steer: STILL, acts: [] });
    h.input(west, { seq: 5, steer: EAST_STEER, acts: [] });
    h.input(west, { seq: 2, steer: EAST_STEER, acts: [] });
    h.run(TICK_MS * 3);
    const snap = h.last(west, 'snap');
    expect(snap.ack).toBe(5);
    expect(snap.view.players.find((p) => p.id === WEST)!.move.kind).toBe('idle');
  });

  it('applies every press from a burst at once but still walks one stride per tick', () => {
    const { h, west } = started();
    const from = h.last(west, 'matchStart').match.view.players.find((p) => p.id === WEST)!.pos.x;
    for (let seq = 1; seq <= 9; seq += 1) h.input(west, { seq, steer: EAST_STEER, acts: seq === 2 ? [{ kind: 'buy', purchase: { kind: 'item', id: 'grapple' } }] : [] });
    h.run(TICK_MS);
    const me = h.room.match!.state.players.find((p) => p.id === WEST)!;
    expect(h.room.match?.fighters.find((f) => f.id === WEST)).toMatchObject({ ack: 8, queue: [{ seq: 9 }] });
    expect(me.items.grapple.kind).toBe('owned');
    expect(me.pos.x).toBeCloseTo(from + 10, 5);
  });

  it('keeps only so many inputs waiting, whatever is sent', () => {
    const { h, west } = started();
    for (let seq = 1; seq <= 500; seq += 1) h.input(west, { seq, steer: EAST_STEER, acts: [] });
    expect(h.room.match?.fighters.find((f) => f.id === WEST)?.queue).toHaveLength(RULES.inputQueueMax);
  });
});

describe('taking inputs from the queue', () => {
  const queue = (count: number) => Array.from({ length: count }, (_, i) => ({ seq: i + 1, steer: STILL, acts: [] }));

  it('takes one a tick, leaves one spare, and folds a burst', () => {
    expect(takeInputs(queue(0), 1)).toEqual({ apply: [], rest: [] });
    expect(takeInputs(queue(1), 1).apply.map((i) => i.seq)).toEqual([1]);
    expect(takeInputs(queue(2), 1)).toMatchObject({ apply: [{ seq: 1 }], rest: [{ seq: 2 }] });
    expect(takeInputs(queue(5), 1)).toMatchObject({ apply: [{ seq: 1 }, { seq: 2 }, { seq: 3 }, { seq: 4 }], rest: [{ seq: 5 }] });
  });
});

describe('fog of war', () => {
  const sawEnemy = (h: ReturnType<typeof harness>, member: Parameters<ReturnType<typeof harness>['sentTo']>[0], enemy: PlayerId): boolean =>
    h.sentTo(member, 'snap').some((snap) => snap.view.players.some((p) => p.id === enemy));

  it('never sends a team a fighter it cannot see, nor an enemy purse', () => {
    const { h, west, east } = started(RULES, true);
    h.run(2000);
    expect(h.sentTo(east, 'snap').length).toBeGreaterThan(30);
    expect(sawEnemy(h, east, WEST)).toBe(false);
    expect(sawEnemy(h, west, EAST)).toBe(false);
    expect(JSON.stringify(h.sentTo(east, 'snap'))).not.toContain('"x":420');
    expect(h.last(east, 'snap').view.roster.find((c) => c.id === WEST)).not.toHaveProperty('gold');
    expect(h.last(east, 'matchStart').match.view.players.map((p) => p.id)).toEqual([EAST]);
  });

  it('sends the enemy once they walk into sight', () => {
    const { h, west, east } = started(RULES, true);
    for (let seq = 1; seq <= 60; seq += 1) {
      h.input(west, { seq, steer: EAST_STEER, acts: [] });
      h.input(east, { seq, steer: { x: -1, y: 0 }, acts: [] });
      h.run(TICK_MS);
    }
    expect(sawEnemy(h, east, WEST)).toBe(true);
  });

  it('sends a team a pickup exactly while it is in that team\'s sight', () => {
    const { h, west, east } = started(RULES, true);
    const state = () => h.room.match!.state;
    while (state().pickups.length === 0) h.run(TICK_MS);
    const id = state().pickups[0]!.id;
    const shown = { west: [] as boolean[], east: [] as boolean[] };
    for (let i = 0; i < 30 * 20 && state().pickups.some((p) => p.id === id); i += 1) {
      h.forget();
      h.run(TICK_MS);
      ([['west', west], ['east', east]] as const).forEach(([team, member]) => {
        const sees = visibleTo(state(), team).pickups.has(id);
        h.sentTo(member, 'snap').forEach((snap) => {
          expect(snap.view.pickups.some((p) => p.id === id)).toBe(sees);
          shown[team].push(sees);
        });
      });
    }
    expect(shown.west).toContain(false);
    expect(shown.west).toContain(true);
  });

  it('sends everyone everything when the fog is off', () => {
    const { h, east } = started(RULES, false);
    h.run(500);
    expect(h.sentTo(east, 'snap').every((snap) => snap.view.players.length === 2)).toBe(true);
  });
});
